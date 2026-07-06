// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const AuditLog = db.AuditLog;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

/**
 * GET /v1/auditlog/bycompany/:id — the audit trail for a company (#460).
 * Scoped: a non-master key may only read its own company's trail (403
 * otherwise — the resource is the company's own log, not a cross-tenant
 * row, so a plain 403 is fine here). Honors ?method / ?entity filters
 * and pagination; newest first.
 */
exports.listByCompany = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetCompanyId = Number(req.params.id);
    if (!Number.isInteger(targetCompanyId) || targetCompanyId <= 0) {
        return res.status(400).json({ message: "Invalid company id." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || companyId !== targetCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const where = { alogCompId: targetCompanyId };
    if (typeof req.query.method === 'string' && req.query.method) where.alogMethod = req.query.method;
    if (typeof req.query.entity === 'string' && req.query.entity) where.alogEntity = req.query.entity.toLowerCase();

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await AuditLog.findAndCountAll({
            where,
            limit,
            offset,
            order: [['alogId', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, entries: rows });
    } catch (error) {
        log.error({ err: error }, 'AuditLog.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};
