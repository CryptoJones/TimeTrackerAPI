// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const TimeEntry = db.TimeEntry;

// Auth helpers used to live inline here — they now share a single
// source of truth in app/middleware/auth.js. PascalCase aliases
// preserve the existing call sites in the controller body.
const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = [
    'teCustId', 'teDescription', 'teStartedAt', 'teEndedAt',
    'teBillable',
];
const ALLOWED_FIELDS_UPDATE = [
    'teDescription', 'teStartedAt', 'teEndedAt', 'teBillable',
];

function computeMinutes(startedAt, endedAt) {
    if (!startedAt || !endedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) / 60000);
}

/**
 * POST /v1/timeentry
 *
 * Create a new time entry for a customer in the auth'd company.
 * Master keys may set teCompId; non-master keys' entries are
 * scoped to their own company.
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await IsMaster(authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.body && req.body.teCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify teCompId." });
        }
    } else {
        companyId = await GetCompanyId(authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (req.body && req.body.teCompId !== undefined &&
            Number(req.body.teCompId) !== companyId) {
            return res.status(403).json({
                message: "Cannot create a time entry for a company you do not belong to.",
            });
        }
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    if (!payload.teCustId || !Number.isInteger(Number(payload.teCustId))) {
        return res.status(400).json({ message: "teCustId is required and must be an integer." });
    }
    if (!payload.teStartedAt) {
        return res.status(400).json({ message: "teStartedAt is required (ISO 8601)." });
    }
    payload.teCompId = companyId;
    payload.teArch = false;
    payload.teMinutes = computeMinutes(payload.teStartedAt, payload.teEndedAt);

    try {
        const created = await TimeEntry.create(payload);
        return res.status(201).json({ message: "Time entry created.", timeEntry: created });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * GET /v1/timeentry/:id — fetch a single time entry by id.
 *
 * Scoped: non-master keys may only read entries in their own company.
 */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let entry;
    try {
        entry = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", timeEntry: entry });
};

/**
 * GET /v1/timeentry/bycompany/:id — list time entries for a company.
 *
 * Honors `?customerId=<int>` filter, `?from=<iso>` / `?to=<iso>`
 * date-range filter, and `?limit=<int>` (default 100, max 500).
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

    const where = { teCompId: targetCompanyId, teArch: false };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) {
        where.teCustId = customerId;
    }
    // Date range — use Sequelize.Op.gte/lte. Keep it permissive: bad
    // dates are silently dropped rather than 400'd, so a typo in the
    // query string doesn't break the call.
    const Op = db.Sequelize && db.Sequelize.Op;
    if (Op && req.query.from) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: req.query.from });
    }
    if (Op && req.query.to) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: req.query.to });
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;

    try {
        const entries = await TimeEntry.findAll({ where, limit, order: [['teStartedAt', 'DESC']] });
        return res.status(200).json({
            message: "Found.",
            count: entries.length,
            limit,
            timeEntries: entries,
        });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * PATCH /v1/timeentry/:id — partial update.
 *
 * Only ALLOWED_FIELDS_UPDATE may be patched. teCompId / teCustId /
 * teArch / teMinutes are server-managed and not user-settable here.
 */
exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let entry;
    try {
        entry = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }
    // Recompute minutes if either bound changed.
    if (updates.teStartedAt !== undefined || updates.teEndedAt !== undefined) {
        updates.teMinutes = computeMinutes(
            updates.teStartedAt !== undefined ? updates.teStartedAt : entry.teStartedAt,
            updates.teEndedAt !== undefined ? updates.teEndedAt : entry.teEndedAt,
        );
    }
    try {
        await entry.update(updates);
        return res.status(200).json({ message: "Updated.", timeEntry: entry });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * DELETE /v1/timeentry/:id — soft-delete (sets teArch = true).
 *
 * Time entries are never physically removed via the API.
 */
exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let entry;
    try {
        entry = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await entry.update({ teArch: true });
        return res.status(200).json({ message: "Archived.", id: entry.teId });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

// Exposed for unit testing.
exports._internals = { computeMinutes, IsMaster, GetCompanyId };
