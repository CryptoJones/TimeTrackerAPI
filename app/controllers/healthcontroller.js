// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const path = require('node:path');
const db = require('../config/db.config.js');

// Read the version from package.json once at module load. `npm_package_version`
// is only set when the process is started via an npm script — production
// deployments that launch `node server.js` directly (including the Dockerfile
// in this repo, CMD ["node", "server.js"]) get `undefined` there and the
// /healthz response degrades to `version: "unknown"`. Reading the manifest
// gives operators a real version string regardless of how the process started.
let PACKAGE_VERSION = 'unknown';
try {
    PACKAGE_VERSION = require(path.resolve(__dirname, '../../package.json')).version
        || PACKAGE_VERSION;
} catch (_err) {
    // package.json missing or malformed — keep the 'unknown' fallback rather
    // than crashing module load. /healthz is operationally important and
    // must come up even on a broken install.
}

/**
 * GET /healthz
 *
 * Lightweight liveness + DB-readiness probe for orchestrators
 * (systemd, Docker HEALTHCHECK, Kubernetes liveness/readiness,
 * uptime monitors). No authKey required — the endpoint reveals
 * only "the server is running", "the DB connection works", and
 * "the schema is at version X" (informative, not a secret —
 * migration filenames are also visible in git history and
 * `app/migrations/`).
 *
 * Response shape:
 *   {
 *     "status": "ok" | "degraded",
 *     "db":     "ok" | "down",
 *     "uptime_s": <int>,
 *     "version": <string>,
 *     "elapsed_ms": <number>,
 *     "migration": <last applied migration name> | null
 *   }
 *
 * - 200 when DB ping succeeds.
 * - 503 when DB ping fails (so orchestrators can take the pod
 *   out of rotation until the dependency recovers).
 *
 * `migration` lets a caller verify a rolling deploy is at the
 * expected schema. When the DB is down it's null; when up but
 * SequelizeMeta is missing (fresh DB pre-migration) it's also
 * null. The probe itself never fails on the migration read —
 * a degraded migration query falls back to `migration: null`
 * without flipping `status` to degraded, since the DB is still
 * usable for actual API requests.
 */
exports.healthz = async (req, res) => {
    const started = process.hrtime.bigint();
    let dbOk = false;
    let dbError;
    let migration = null;
    try {
        // Cheapest possible DB-roundtrip: `SELECT 1`. Confirms the
        // pool can hand us a connection AND that Postgres responds.
        await db.sequelize.query('SELECT 1 AS ok;', {
            type: db.sequelize.QueryTypes.SELECT,
            // Short timeout so a hung DB doesn't drag the probe out.
            // Sequelize uses pg's `query_timeout` for this on Postgres.
            // 2s is well over the expected sub-ms response, well under
            // a typical orchestrator probe timeout (usually 5–10s).
            raw: true,
        });
        dbOk = true;

        // Best-effort schema version read. SequelizeMeta is the
        // sequelize-cli convention: a single-column table named
        // `name` holding one row per applied migration. We grab
        // the lexicographically highest entry — migration filenames
        // are timestamp-prefixed (`20260518000000-…`) so lex order
        // matches apply order.
        //
        // Schema-qualify "dbo"."SequelizeMeta" because
        // sequelize-cli.config.js sets `migrationStorageTableSchema:
        // 'dbo'` so the table lives in `dbo`, not `public`. Without
        // the qualifier the query 404s silently against `public` on
        // every real deployment and the catch below maps it to
        // `migration: null` — making the field useless for verifying
        // rolling deploys.
        try {
            const rows = await db.sequelize.query(
                'SELECT "name" FROM "dbo"."SequelizeMeta" ORDER BY "name" DESC LIMIT 1',
                { type: db.sequelize.QueryTypes.SELECT },
            );
            if (rows && rows[0] && rows[0].name) {
                migration = String(rows[0].name);
            }
        } catch (_) {
            // SequelizeMeta missing (e.g., fresh DB pre-migration)
            // or a read failure. Don't flip the probe to degraded —
            // the DB itself is still up. Leave migration: null.
        }
    } catch (error) {
        dbError = String(error && error.message ? error.message : error);
    }

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const body = {
        status: dbOk ? 'ok' : 'degraded',
        db: dbOk ? 'ok' : 'down',
        uptime_s: Math.round(process.uptime()),
        version: PACKAGE_VERSION,
        elapsed_ms: Math.round(elapsedMs * 100) / 100,
        migration,
    };
    if (dbError) {
        body.db_error = dbError;
    }
    return res.status(dbOk ? 200 : 503).json(body);
};
