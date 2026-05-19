// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Database connection configuration.
//
// Values are pulled from process.env so credentials never live in source
// control. See `.env.example` at the repo root for the full list of variables.
// `require('dotenv').config()` in server.js loads them from a local `.env`
// file in development; in production set them via your process manager,
// container orchestrator, or shell.

// Same parseInt-leniency caveat as `PORT` in server.js (#124):
// `parseInt("5432abc")` returns 5432, so a typo'd DB_PORT silently
// turns into the implicit default. Guard with Number.isFinite + > 0
// so only NaN / non-positive values fall through to 5432. Port 0
// is not a valid postgres listen port; trying to connect there
// would just fail at the socket layer.
const dbPortRaw = parseInt(process.env.DB_PORT, 10);
const dbPort = Number.isFinite(dbPortRaw) && dbPortRaw > 0 ? dbPortRaw : 5432;

const env = {
    database: process.env.DB_NAME || 'timetracker',
    username: process.env.DB_USER || 'timetracker',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: dbPort,
};

if (!env.password) {
    // In development, an empty password is normal (running tests
    // without a live DB, scaffolding a fresh repo, etc.) — warn and
    // keep going.
    //
    // In production, an empty password means the operator forgot to
    // wire credentials. We hard-fail here rather than at first DB
    // query so the misconfiguration surfaces during process startup
    // (where systemd/k8s catch it and won't flip traffic), not after
    // the load balancer has already sent the pod 200/health checks.
    if (process.env.NODE_ENV === 'production') {
        console.error(
            '[env] DB_PASSWORD is empty and NODE_ENV=production. ' +
            'Refusing to start. Set DB_PASSWORD via your process manager, ' +
            'container orchestrator, or shell.'
        );
        process.exit(1);
    }
    console.warn(
        '[env] DB_PASSWORD is empty. Set it in .env (development) or via your ' +
        'environment (production). Connections will likely fail without it.'
    );
}

module.exports = env;
