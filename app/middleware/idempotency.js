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

const TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours
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
 * Behavior on header present:
 *   - First time we've seen this (scope, key): proceed to handler,
 *     then write the response to the cache before returning.
 *   - Same (scope, key), same body hash: replay the cached response.
 *   - Same (scope, key), DIFFERENT body hash: 409 Conflict with a
 *     stable `{message, code: "idempotency_key_reused"}` body.
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
            // crisp 400 the client can act on. Skips both the cache
            // lookup AND the handler — pre-bound, this branch would
            // have stack-overflowed at depth ~5000, surfacing as 500.
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

    if (existing) {
        if (existing.requestHash !== bodyHash) {
            return res.status(409).json({
                message: 'Idempotency-Key was reused with a different request body.',
                code: 'idempotency_key_reused',
            });
        }
        // Replay the cached response verbatim. Set a header so
        // clients can tell a replay apart from a fresh write — useful
        // for observability and for client-side write counters.
        res.setHeader('Idempotency-Replay', 'true');
        return res.status(existing.status).json(existing.body);
    }

    // First time seeing this key. Intercept the handler's response
    // so we can persist it BEFORE the bytes flush to the client. We
    // wrap res.json (the controllers' uniform exit) and store there.
    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body) {
        // Statuscode could have been set via res.status() prior to
        // .json(). Default to 200 if nothing explicit.
        const status = res.statusCode || 200;
        // Only persist successful or client-error writes. 5xx
        // responses indicate the request never succeeded and we
        // want the retry to actually re-run.
        if (status >= 200 && status < 500) {
            const expiresAt = new Date(Date.now() + TTL_MS);
            // Fire and forget — the response shouldn't block on the
            // cache write. If the INSERT loses a race with a
            // concurrent retry the UNIQUE constraint catches it.
            getDb().sequelize.query(
                `INSERT INTO "dbo"."IdempotencyKey"
                    ("ikScope", "ikKey", "ikRequestHash",
                     "ikResponseStatus", "ikResponseBody", "ikExpiresAt")
                 VALUES (:scope, :key, :requestHash,
                         :status, :body::jsonb, :expiresAt)
                 ON CONFLICT ("ikScope", "ikKey") DO NOTHING`,
                {
                    replacements: {
                        scope,
                        key: rawKey,
                        requestHash: bodyHash,
                        status,
                        body: JSON.stringify(body),
                        expiresAt,
                    },
                },
            ).catch((error) => {
                log.warn({ err: error }, 'IdempotencyKey: store failed');
            });
        }
        return originalJson(body);
    };

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
    MAX_CANONICAL_DEPTH,
    CanonicalJsonDepthError,
    // Test-only seam: pass a stub `{ sequelize: { query: ... }, Sequelize:
    // { QueryTypes: { SELECT } } }` to drive the cache lookup + write
    // paths from HTTP tests. Pass null (or no arg) to restore the
    // production lookup. Production code MUST NOT call this.
    _setDbForTesting,
};
