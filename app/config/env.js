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

const env = {
    database: process.env.DB_NAME || 'timetracker',
    username: process.env.DB_USER || 'timetracker',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    dialect: 'postgres',
    define: {
        timestamps: false,
    },
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
