// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * audit.js — record successful mutations to the audit log (#460).
 *
 * Mounted on /v1 AFTER attachAuth (so req.isMaster / req.companyId are
 * set). For mutating methods it attaches a `finish` listener and, once
 * the response is sent, writes an AuditLog row FIRE-AND-FORGET: the write
 * happens off the request's critical path and any failure is swallowed
 * (logged) — an audit hiccup must never break or slow a real request.
 * Only successful (< 400) mutations are recorded.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Parse the entity segment from a /v1/<entity>/... path. */
function entityOf(path) {
    const m = /^\/v1\/([a-zA-Z-]+)/.exec(path || '');
    return m ? m[1].toLowerCase() : null;
}

function auditLog(req, res, next) {
    const method = (req.method || '').toUpperCase();
    if (!MUTATING.has(method)) return next();

    res.on('finish', () => {
        try {
            if (res.statusCode >= 400) return; // only successful mutations
            if (!db.AuditLog || typeof db.AuditLog.create !== 'function') return;

            const isMaster = req.isMaster === true;
            const companyId = typeof req.companyId === 'number' && req.companyId > 0 ? req.companyId : null;
            const fullPath = (req.originalUrl || req.url || '').split('?')[0];

            const row = {
                alogCompId: isMaster ? null : companyId,
                alogActor: isMaster ? 'master' : (companyId != null ? `company:${companyId}` : 'unknown'),
                alogMethod: method,
                alogPath: fullPath,
                alogEntity: entityOf(fullPath),
                alogStatus: res.statusCode,
            };

            Promise.resolve(db.AuditLog.create(row)).catch((err) => {
                log.error({ err }, 'audit: write failed');
            });
        } catch (err) {
            log.error({ err }, 'audit: middleware error');
        }
    });

    return next();
}

module.exports = { auditLog, entityOf };
