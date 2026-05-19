// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const pino = require('pino');

// Singleton logger. Level + transport are env-configurable:
//   LOG_LEVEL=info|debug|warn|error|silent  (default: info)
//   LOG_PRETTY=1                            (default: off — JSON only)
//
// Pino emits one JSON object per line in production. That's the
// expected wire format for log shippers (Vector, Loki, CloudWatch).
// In development, set LOG_PRETTY=1 to enable pino-pretty for human-
// readable colorized output — but pino-pretty is NOT a required
// dependency, so the wire format is the default.

const level = process.env.LOG_LEVEL || 'info';

let transport;
if (process.env.LOG_PRETTY === '1') {
    // Check `pino-pretty` is actually installed BEFORE handing the
    // transport config to pino. Assigning the object literal alone
    // never throws — pino lazy-resolves the `target` module later
    // and emits a cryptic error on startup if it's missing. The
    // `require.resolve` synchronously throws MODULE_NOT_FOUND when
    // the module isn't on disk, so the catch below fires cleanly
    // and we fall through to default JSON output, matching the
    // "pino-pretty is NOT a required dependency" header comment.
    try {
        require.resolve('pino-pretty');
        transport = {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' },
        };
    } catch (_err) {
        // pino-pretty not installed — silently fall through to JSON
        // output. We don't warn here because the only consumer of
        // LOG_PRETTY=1 is interactive dev, and a noisy stderr line
        // would clutter the very output the operator was trying to
        // make readable.
    }
}

const logger = pino({
    level,
    redact: {
        // Defense-in-depth: even if someone logs a request object by
        // accident, the authKey value never lands in the log.
        paths: [
            'req.headers.authkey',
            'req.headers.authKey',
            'req.headers.authorization',
            'headers.authkey',
            'headers.authKey',
            'headers.authorization',
            '*.authKey',
            '*.authkey',
        ],
        censor: '<REDACTED>',
    },
    ...(transport ? { transport } : {}),
});

module.exports = logger;
