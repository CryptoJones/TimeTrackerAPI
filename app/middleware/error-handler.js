// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const log = require('../config/logger.js');

/**
 * Global error handler. Mounted AFTER all routes in server.js.
 *
 * Two failure modes it cleans up:
 *
 * 1. `next(err)` calls from controllers / future middleware land
 *    here; previously they fell through to Express's default
 *    handler which renders an HTML error page. We always want JSON.
 *
 * 2. Uncaught exceptions inside an async route handler get
 *    promoted to the error handler by Express ^4.21 automatically
 *    — but only if the handler uses `async` and lets the promise
 *    reject. Controllers in this codebase already do their own
 *    try/catch + log + 500.json(), so this handler is the
 *    safety net for anything that slips through.
 *
 * Body shape (matches the rest of the API):
 *   { message: 'Error!', requestId: <pino req id, if available> }
 *
 * Stack traces are NEVER returned to the client. They land in the
 * structured log instead, where they're searchable + filtered.
 */
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        // Express docs say: delegate to default handler if headers
        // already sent (avoids "Cannot set headers" cascades).
        return next(err);
    }

    // 4xx are client errors and should not log as `error` — they're
    // expected. Default to 500 if no status is set.
    const status = Number.isInteger(err && err.status) && err.status >= 400 && err.status < 600
        ? err.status
        : 500;

    const logBody = {
        err: err,
        status,
        method: req.method,
        url: req.originalUrl,
        requestId: req.id || (req.log && req.log.bindings && req.log.bindings().reqId),
    };
    if (status >= 500) {
        log.error(logBody, 'unhandled error');
    } else {
        log.warn(logBody, 'request error');
    }

    const body = {
        message: status >= 500 ? 'Error!' : (err.message || 'Bad Request'),
    };
    if (logBody.requestId) {
        body.requestId = logBody.requestId;
    }
    return res.status(status).json(body);
}

/**
 * 404 fallthrough. Mounted right before the error handler so any
 * unmatched route emits a structured 404 instead of Express's HTML.
 */
function notFound(req, res) {
    return res.status(404).json({
        message: 'Not found.',
        method: req.method,
        path: req.originalUrl,
    });
}

module.exports = { errorHandler, notFound };
