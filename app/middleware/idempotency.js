// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Stripe-style Idempotency-Key support for POST endpoints.
 *
 * Why
 *   POSTs that create resources (TimeEntry, Customer, Invoice, etc.)
 *   are unsafe to retry blindly — a network blip during the client's
 *   read of the response makes the retry indistinguishable from a
 *   first attempt, and the server creates a duplicate row.
 *
 *   A client that picks an `Idempotency-Key` header on the original
 *   request can replay the exact same call freely: this middleware
 *   stores the first response for 24h and replays it for any matching
 *   retry within that window. If the client sends the SAME key with
 *   a DIFFERENT body, we return 409 to flag the misuse.
 *
 * Scope
 *   The cache key is sha256(authKey || ':' || method || path). Two
 *   different operators (or two different routes) cannot collide
 *   even if they pick the same Idempotency-Key string. We index the
 *   body separately so we can tell "same retry" from "same key,
 *   different intent".
 *
 * Cleanup
 *   Each request opportunistically prunes rows past `ikExpiresAt`.
 *   No background sweeper job needed — at typical write rates the
 *   table stays small. Tradeoff: a quiet period leaves a few expired
 *   rows around; ignored on the next write.
 */

const crypto = require('crypto');
const log = require('../config/logger.js');

/**
 * Late-bound + injectable DB accessor. Same pattern as
 * `app/middleware/auth.js#getDb` — vitest's `vi.mock` does not
 * reliably intercept this codebase's CJS `require()`, so HTTP-level
 * tests that want to drive the replay-cache logic substitute a stub
 * via `_setDbForTesting(stub)`. Production code MUST NOT call the
 * setter. P5-M (idempotency follow-up).
 */
let _dbOverride = null;
function getDb() {
    return _dbOverride || require('../config/db.config.js');
}
function _setDbForTesting(db) {
    _dbOverride = db || null;
}

const TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours — a COMPLETED response is cached this long
// A PENDING claim not completed within this window is treated as dead (its
// holder crashed / the connection dropped) and may be re-claimed by a retry.
// Bounds how long a stuck claim blocks retries; short enough that a client
// recovers quickly, long enough to cover any realistic handler duration.
const PENDING_TTL_MS = 5 * 60 * 1000;  // 5 minutes
// Keys are client-picked; reject anything that looks like garbage.
// Stripe accepts up to 255 chars; we mirror that and require
// printable ASCII to avoid `\0` injection into the SQL replacement
// (Sequelize parameterizes, but defense in depth).
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

function sha256(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
}

/**
 * Stable JSON serializer so that two semantically-identical bodies
 * (e.g., `{a:1,b:2}` vs `{b:2,a:1}`) hash to the same value. Without
 * this, a client that reorders its JSON fields on retry would trip
 * the body-mismatch 409.
 *
 * Bounded by MAX_CANONICAL_DEPTH (default 64). Without the bound, a
 * deeply-nested body (`{"a":{"a":...5000 levels...}}`) overflows
 * Node's call stack with a RangeError at depth ~5000, which Express's
 * async error path surfaces as a 500. The 100KB express.json limit
 * allows up to ~20000 nesting levels (5 chars per level), so the
 * pre-bound version was reliably DoS-able through `POST /v1/* +
 * Idempotency-Key: x`. 64 levels is well above any legitimate
 * planning-API body's nesting; we throw a tagged Error that the
 * middleware catches and returns as a 400.
 */
const MAX_CANONICAL_DEPTH = 64;

class CanonicalJsonDepthError extends Error {
    constructor() {
        super(`Body exceeds maximum nesting depth (${MAX_CANONICAL_DEPTH}) for Idempotency-Key processing.`);
        this.name = 'CanonicalJsonDepthError';
        this.code = 'body_too_deep';
    }
}

function canonicalJson(value, depth = 0) {
    if (depth > MAX_CANONICAL_DEPTH) {
        throw new CanonicalJsonDepthError();
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map((v) => canonicalJson(v, depth + 1)).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) =>
        JSON.stringify(k) + ':' + canonicalJson(value[k], depth + 1),
    ).join(',') + '}';
}

function hashBody(body) {
    // null body (no req.body, e.g., a POST with no JSON) collapses
    // to the literal string "null" so two no-body retries still
    // match each other.
    return sha256(canonicalJson(body == null ? null : body));
}

function buildScope(req) {
    // attachAuth runs upstream so req.authKey is populated when the
    // header was supplied. For requests where attachAuth hasn't run
    // we fall back to the raw header — gives a stable hash key but
    // not a security boundary (the upstream auth check is the
    // boundary; idempotency just dedups).
    const authKey = (req && (req.authKey || (req.get && req.get('authKey')))) || '';
    return sha256(authKey + ':' + req.method + ':' + (req.path || ''));
}

async function pruneExpired(sequelize) {
    try {
        await sequelize.query(
            'DELETE FROM "dbo"."IdempotencyKey" WHERE "ikExpiresAt" < now()',
        );
    } catch (error) {
        // Pruning is best-effort. Log and continue.
        log.warn({ err: error }, 'IdempotencyKey: prune failed');
    }
}

/**
 * Express middleware. Mount on routes that should support idempotent
 * retries. If the request lacks an `Idempotency-Key` header the
 * middleware is a no-op (passes through to the handler).
 *
 * Behavior on header present — a pre-handler CLAIM protocol so two
 * concurrent requests with the same key can never both execute the
 * side effect (the double-charge window, audit item #2):
 *   - We first try to atomically INSERT a PENDING claim row (or
 *     re-claim one left past PENDING_TTL by a crashed holder). The
 *     RETURNING clause tells us whether WE won the claim.
 *   - Won the claim → run the handler; on a 2xx/4xx response COMPLETE
 *     the row (cache status+body for TTL_MS), on a 5xx / no-JSON exit
 *     RELEASE it (delete the pending row) so a retry re-runs.
 *   - Lost the claim (a live row already exists):
 *       · same key, DIFFERENT body → 409 idempotency_key_reused.
 *       · same key+body, still PENDING → 409 idempotency_in_progress.
 *       · same key+body, COMPLETED → replay the cached response.
 *   - Storage failure: log + proceed (the dedup is best-effort; we
 *     never want it to break a write that would otherwise succeed).
 */
async function idempotency(req, res, next) {
    const rawKey = req.get && req.get('Idempotency-Key');
    if (!rawKey) return next();
    if (!KEY_PATTERN.test(rawKey)) {
        return res.status(400).json({
            message: 'Invalid Idempotency-Key header — must be 1-255 printable ASCII chars.',
        });
    }

    if (!getDb().sequelize || typeof getDb().sequelize.query !== 'function') {
        // Test env or misconfiguration. Don't block writes.
        return next();
    }

    const scope = buildScope(req);
    let bodyHash;
    try {
        bodyHash = hashBody(req.body);
    } catch (error) {
        if (error instanceof CanonicalJsonDepthError) {
            // Don't propagate as 500 via the global error path; emit a
            // crisp 400 the client can act on. Skips both the claim AND
            // the handler — pre-bound, this branch would have stack-
            // overflowed at depth ~5000, surfacing as 500.
            //
            // Message is hardcoded (rather than `error.message`) so we
            // match the controller-error-shape policy — middleware
            // bodies must never echo a caught error's .message field
            // (regression pin in tests/unit/controller-error-shape.test.js).
            // The depth limit IS the message text, so a constant works.
            return res.status(400).json({
                message: `Body exceeds maximum nesting depth (${MAX_CANONICAL_DEPTH}) for Idempotency-Key processing.`,
                code: 'body_too_deep',
            });
        }
        throw error;
    }

    // Best-effort prune. Fire-and-forget so the request path never
    // waits on DELETE; errors are swallowed via the .catch(). Cheap
    // because the index on ikExpiresAt covers it.
    pruneExpired(getDb().sequelize).catch(() => {});

    // Atomically CLAIM the (scope, key) slot: INSERT a pending row, or
    // re-claim one whose previous holder left it past PENDING_TTL. A live
    // row (pending or completed) is left untouched by the WHERE guard, so
    // RETURNING yields a row ONLY when we actually (re)claimed. This is the
    // serialization point — Postgres resolves concurrent INSERT…ON CONFLICT
    // one at a time, so exactly one request wins.
    let claimed;
    try {
        const result = await getDb().sequelize.query(
            `INSERT INTO "dbo"."IdempotencyKey"
                ("ikScope", "ikKey", "ikRequestHash",
                 "ikResponseStatus", "ikResponseBody", "ikExpiresAt")
             VALUES (:scope, :key, :requestHash, NULL, NULL, :pendingExpiry)
             ON CONFLICT ("ikScope", "ikKey") DO UPDATE
                SET "ikRequestHash" = EXCLUDED."ikRequestHash",
                    "ikResponseStatus" = NULL,
                    "ikResponseBody" = NULL,
                    "ikExpiresAt" = EXCLUDED."ikExpiresAt"
                WHERE "dbo"."IdempotencyKey"."ikExpiresAt" < now()
             RETURNING "ikId"`,
            {
                replacements: {
                    scope,
                    key: rawKey,
                    requestHash: bodyHash,
                    pendingExpiry: new Date(Date.now() + PENDING_TTL_MS),
                },
            },
        );
        const rows = Array.isArray(result) ? result[0] : null;
        claimed = Array.isArray(rows) && rows.length > 0;
    } catch (error) {
        // Best-effort: a claim failure must never block a write.
        log.warn({ err: error }, 'IdempotencyKey: claim failed, proceeding without dedup');
        return next();
    }

    if (!claimed) {
        // A live row already holds this (scope, key). Look it up to decide.
        let existing;
        try {
            const rows = await getDb().sequelize.query(
                `SELECT "ikRequestHash" AS "requestHash",
                        "ikResponseStatus" AS "status",
                        "ikResponseBody" AS "body"
                   FROM "dbo"."IdempotencyKey"
                  WHERE "ikScope" = :scope AND "ikKey" = :key
                    AND "ikExpiresAt" >= now()`,
                {
                    replacements: { scope, key: rawKey },
                    type: getDb().Sequelize.QueryTypes.SELECT,
                },
            );
            existing = rows && rows[0];
        } catch (error) {
            log.warn({ err: error }, 'IdempotencyKey: lookup failed, proceeding without dedup');
            return next();
        }

        if (!existing) {
            // The row expired / was pruned between claim and lookup — a rare
            // race. Proceed without dedup rather than surface a 500.
            return next();
        }
        if (existing.requestHash !== bodyHash) {
            return res.status(409).json({
                message: 'Idempotency-Key was reused with a different request body.',
                code: 'idempotency_key_reused',
            });
        }
        if (existing.status == null) {
            // A concurrent request with the same key+body is still executing.
            return res.status(409).json({
                message: 'A request with this Idempotency-Key is already in progress.',
                code: 'idempotency_in_progress',
            });
        }
        // Completed → replay the cached response verbatim. The header lets
        // clients tell a replay apart from a fresh write.
        res.setHeader('Idempotency-Replay', 'true');
        return res.status(existing.status).json(existing.body);
    }

    // WE own the execution. COMPLETE the claim (cache the response) on a
    // 2xx/4xx, or RELEASE it (delete the still-pending row) on a 5xx or a
    // no-JSON exit so a retry re-runs. `settled` guards against the finish
    // safety-net double-acting.
    let settled = false;
    const completeClaim = (status, body) => {
        if (settled) return;
        settled = true;
        getDb().sequelize.query(
            `UPDATE "dbo"."IdempotencyKey"
                SET "ikResponseStatus" = :status,
                    "ikResponseBody" = :body::jsonb,
                    "ikExpiresAt" = :expiresAt
              WHERE "ikScope" = :scope AND "ikKey" = :key
                AND "ikResponseStatus" IS NULL`,
            {
                replacements: {
                    scope,
                    key: rawKey,
                    status,
                    // A bound `undefined` replacement throws in Sequelize, which
                    // would leave the row stuck pending; cache JSON `null` so a
                    // no-body 2xx still completes (and replays as null).
                    body: body === undefined ? 'null' : JSON.stringify(body),
                    expiresAt: new Date(Date.now() + TTL_MS),
                },
            },
        ).catch((error) => {
            log.warn({ err: error }, 'IdempotencyKey: complete failed');
        });
    };
    const releaseClaim = () => {
        if (settled) return;
        settled = true;
        getDb().sequelize.query(
            `DELETE FROM "dbo"."IdempotencyKey"
              WHERE "ikScope" = :scope AND "ikKey" = :key
                AND "ikResponseStatus" IS NULL`,
            { replacements: { scope, key: rawKey } },
        ).catch((error) => {
            log.warn({ err: error }, 'IdempotencyKey: release failed');
        });
    };

    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body) {
        const status = res.statusCode || 200;
        if (status >= 200 && status < 500) completeClaim(status, body);
        else releaseClaim();  // 5xx → release so a retry re-runs
        return originalJson(body);
    };
    // If the response finishes WITHOUT going through res.json (a non-JSON
    // send, or an error that bypasses res.json), decide by status: a 2xx/4xx
    // still SUCCEEDED, so COMPLETE with a null body — that prevents a retry
    // from re-executing the side effect (we just can't replay the exact body).
    // Only a 5xx releases the claim so a genuine retry re-runs. (An aborted
    // connection never fires `finish`; that pending row clears at PENDING_TTL.)
    res.on('finish', () => {
        if (settled) return;
        const status = res.statusCode || 0;
        if (status >= 200 && status < 500) completeClaim(status, null);
        else releaseClaim();
    });

    return next();
}

module.exports = {
    idempotency,
    // Exported for unit tests:
    canonicalJson,
    hashBody,
    buildScope,
    KEY_PATTERN,
    TTL_MS,
    PENDING_TTL_MS,
    MAX_CANONICAL_DEPTH,
    CanonicalJsonDepthError,
    // Test-only seam: pass a stub `{ sequelize: { query: ... }, Sequelize:
    // { QueryTypes: { SELECT } } }` to drive the cache lookup + write
    // paths from HTTP tests. Pass null (or no arg) to restore the
    // production lookup. Production code MUST NOT call this.
    _setDbForTesting,
};
