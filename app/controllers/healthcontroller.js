// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');

/**
 * GET /healthz
 *
 * Lightweight liveness + DB-readiness probe for orchestrators
 * (systemd, Docker HEALTHCHECK, Kubernetes liveness/readiness,
 * uptime monitors). No authKey required — the endpoint reveals
 * only "the server is running" and "the DB connection works."
 *
 * Response shape:
 *   {
 *     "status": "ok" | "degraded",
 *     "db":     "ok" | "down",
 *     "uptime_s": <int>,
 *     "version": <string>
 *   }
 *
 * - 200 when DB ping succeeds.
 * - 503 when DB ping fails (so orchestrators can take the pod
 *   out of rotation until the dependency recovers).
 */
exports.healthz = async (req, res) => {
    const started = process.hrtime.bigint();
    let dbOk = false;
    let dbError;
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
    } catch (error) {
        dbError = String(error && error.message ? error.message : error);
    }

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const body = {
        status: dbOk ? 'ok' : 'degraded',
        db: dbOk ? 'ok' : 'down',
        uptime_s: Math.round(process.uptime()),
        version: process.env.npm_package_version || 'unknown',
        elapsed_ms: Math.round(elapsedMs * 100) / 100,
    };
    if (dbError) {
        body.db_error = dbError;
    }
    return res.status(dbOk ? 200 : 503).json(body);
};
