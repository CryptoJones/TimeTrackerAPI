// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { ZodError } = require('zod');

/**
 * Express middleware factory: validate.body(schema) / validate.query(schema)
 * / validate.params(schema). On parse failure, responds 400 with a
 * structured error listing every invalid field. On success, replaces
 * req.body / req.query / req.params with the parsed (coerced + stripped)
 * value so controllers see only whitelisted fields.
 *
 * Why this lives at the middleware boundary rather than inside each
 * controller:
 *   - Centralizes the body-whitelist defense (controllers had
 *     hand-rolled ALLOWED_FIELDS arrays — easy to drift).
 *   - Surfaces parse errors as 400 with field-level detail before
 *     they reach Sequelize, which would otherwise emit confusing
 *     "value too long for type character varying(...)"-style 500s.
 *   - Coerces "1" → 1 for path/query int params consistently.
 */

function fmt(err) {
    if (err instanceof ZodError) {
        // Zod 4 exposes `.issues`; older v3 exposed `.errors`. Accept
        // both so the formatter works across zod major bumps.
        const list = err.issues || err.errors || [];
        return {
            message: 'Validation failed.',
            issues: list.map((e) => ({
                path: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
                code: e.code,
                message: e.message,
            })),
        };
    }
    // Fallback for any non-ZodError that `safeParse` somehow surfaces
    // (defensive — zod normally always wraps). Match the controller-
    // wide 5xx policy from #140: never echo raw error text to the
    // client. The full error lands in the structured log via the
    // global error-handler if it ever propagates that far.
    return { message: 'Validation failed.' };
}

function validateOn(key) {
    return (schema) => (req, res, next) => {
        const result = schema.safeParse(req[key]);
        if (!result.success) {
            return res.status(400).json(fmt(result.error));
        }
        req[key] = result.data;
        return next();
    };
}

module.exports = {
    body: validateOn('body'),
    query: validateOn('query'),
    params: validateOn('params'),
};
