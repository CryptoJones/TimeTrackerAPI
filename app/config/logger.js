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
    try {
        transport = {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' },
        };
    } catch (_) {
        // pino-pretty not installed — fall through to JSON output.
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
