// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { rateOnDate } = require('../services/rate-schedule.js');
const RateSchedule = db.RateSchedule;

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

const ALLOWED_FIELDS_CREATE = ['rschName', 'rschRate', 'rschEffectiveFrom', 'rschEffectiveTo', 'rschCompId'];
const ALLOWED_FIELDS_UPDATE = ['rschName', 'rschRate', 'rschEffectiveFrom', 'rschEffectiveTo'];

/** Load a schedule and enforce the secure-404 company scope. */
async function findScoped(req, res) {
    let rs;
    try {
        rs = await RateSchedule.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'RateSchedule.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!rs || rs.rschArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await MasterFromReq(req, req.get('authKey'));
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, req.get('authKey'));
        if (companyId === -1 || rs.rschCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return rs;
}

/** POST /v1/rateschedule — create a dated rate. Non-master defaults rschCompId to its own company. */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMaster;
    try {
        isMaster = await MasterFromReq(req, authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }

    if (!isMaster) {
        let companyId;
        try {
            companyId = await CompanyIdFromReq(req, authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (payload.rschCompId !== undefined && Number(payload.rschCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot create a rate schedule for a company you do not belong to." });
        }
        payload.rschCompId = companyId;
    } else if (payload.rschCompId === undefined || Number(payload.rschCompId) <= 0) {
        return res.status(400).json({ message: "Master-key requests must specify rschCompId." });
    }

    payload.rschArch = false;

    try {
        const created = await RateSchedule.create(payload);
        return res.status(201).json({ message: "Rate schedule created.", rateSchedule: created });
    } catch (error) {
        log.error({ err: error }, 'RateSchedule.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/rateschedule/:id — fetch one. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const rs = await findScoped(req, res);
    if (!rs) return undefined;
    return res.status(200).json({ message: "Found.", rateSchedule: rs });
};

/** GET /v1/rateschedule/bycompany/:id — list a company's schedules (paginated). */
exports.listByCompany = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetCompanyId = Number(req.params.id);
    if (!Number.isInteger(targetCompanyId) || targetCompanyId <= 0) {
        return res.status(400).json({ message: "Invalid company id." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== targetCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await RateSchedule.findAndCountAll({
            where: { rschCompId: targetCompanyId },
            limit,
            offset,
            order: [['rschEffectiveFrom', 'ASC'], ['rschId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, rateSchedules: rows });
    } catch (error) {
        log.error({ err: error }, 'RateSchedule.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/rateschedule/resolve?date=YYYY-MM-DD — the company's effective
 * rate on that date (the latest schedule whose range contains it).
 */
exports.resolve = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.query.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify companyId." });
        }
    } else {
        companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const date = String(req.query.date);
    let schedules;
    try {
        schedules = await RateSchedule.findAll({
            where: { rschCompId: companyId },
            attributes: ['rschId', 'rschRate', 'rschEffectiveFrom', 'rschEffectiveTo'],
        });
    } catch (error) {
        log.error({ err: error }, 'RateSchedule.findAll (resolve) failed');
        return res.status(500).json({ message: "Error!" });
    }
    const rate = rateOnDate(
        schedules.map((s) => ({ effectiveFrom: s.rschEffectiveFrom, effectiveTo: s.rschEffectiveTo, rate: s.rschRate })),
        date,
    );
    return res.status(200).json({ message: "Effective rate resolved.", companyId, date, rate });
};

/** PATCH /v1/rateschedule/:id — partial update. rschCompId / rschArch not settable here. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const rs = await findScoped(req, res);
    if (!rs) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await rs.update(updates);
        return res.status(200).json({ message: "Updated.", rateSchedule: rs });
    } catch (error) {
        log.error({ err: error }, 'RateSchedule.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/rateschedule/:id — soft-delete (sets rschArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const rs = await findScoped(req, res);
    if (!rs) return undefined;

    try {
        await rs.update({ rschArch: true });
        return res.status(200).json({ message: "Archived.", id: rs.rschId });
    } catch (error) {
        log.error({ err: error }, 'RateSchedule archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
