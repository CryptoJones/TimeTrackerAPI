// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { advanceDate } = require('../services/recurring-schedule.js');
const RecurringInvoice = db.RecurringInvoice;

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;

const ALLOWED_FIELDS_UPDATE = ['recinvCadence', 'recinvNextRun', 'recinvActive', 'recinvNote'];

/** Today as 'YYYY-MM-DD' (UTC). */
function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

/** Load a schedule and enforce the secure-404 scope (through its customer's company). */
async function findScoped(req, res) {
    let sched;
    try {
        sched = await RecurringInvoice.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'RecurringInvoice.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!sched || sched.recinvArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await MasterFromReq(req, req.get('authKey'));
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, req.get('authKey'));
        let schedCompanyId;
        try {
            schedCompanyId = await GetCompanyIdByCustomerId(sched.recinvCustId);
        } catch (error) {
            log.error({ err: error }, 'recurringinvoice scope: company resolve failed');
            res.status(500).json({ message: "Error!" });
            return null;
        }
        if (companyId === -1 || schedCompanyId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return sched;
}

/**
 * POST /v1/recurringinvoice — create a schedule for a customer. The
 * customer's company must be the caller's (master keys may target any).
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const body = req.body || {};
    const recinvCustId = Number(body.recinvCustId);
    if (!Number.isInteger(recinvCustId) || recinvCustId <= 0) {
        return res.status(400).json({ message: "recinvCustId is required and must be an integer." });
    }

    let custCompanyId;
    try {
        custCompanyId = await GetCompanyIdByCustomerId(recinvCustId);
    } catch (error) {
        log.error({ err: error }, 'recurringinvoice create: company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (custCompanyId === -1) {
        return res.status(400).json({ message: "recinvCustId must reference a customer." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== custCompanyId) {
            return res.status(403).json({ message: "Cannot schedule invoices for a customer in a company you do not belong to." });
        }
    }

    const payload = {
        recinvCustId,
        recinvCadence: body.recinvCadence,
        recinvNextRun: body.recinvNextRun,
        recinvNote: body.recinvNote,
        recinvActive: true,
        recinvArch: false,
    };
    try {
        const created = await RecurringInvoice.create(payload);
        return res.status(201).json({ message: "Recurring invoice scheduled.", recurringInvoice: created });
    } catch (error) {
        log.error({ err: error }, 'RecurringInvoice.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/recurringinvoice/:id — fetch one. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const sched = await findScoped(req, res);
    if (!sched) return undefined;
    return res.status(200).json({ message: "Found.", recurringInvoice: sched });
};

/** GET /v1/recurringinvoice/bycustomer/:id — a customer's schedules. Secure-404 scoped. */
exports.listByCustomer = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const custId = Number(req.params.id);
    if (!Number.isInteger(custId) || custId <= 0) {
        return res.status(400).json({ message: "Invalid customer id." });
    }

    let custCompanyId;
    try {
        custCompanyId = await GetCompanyIdByCustomerId(custId);
    } catch (error) {
        log.error({ err: error }, 'recurringinvoice listByCustomer: company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (custCompanyId === -1) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== custCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await RecurringInvoice.findAndCountAll({
            where: { recinvCustId: custId },
            limit,
            offset,
            order: [['recinvNextRun', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, recurringInvoices: rows });
    } catch (error) {
        log.error({ err: error }, 'RecurringInvoice.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/recurringinvoice/due — active schedules whose next run is on or
 * before today, across the caller's company (master keys pass companyId).
 */
exports.listDue = async (req, res) => {
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

    const Op = db.Sequelize && db.Sequelize.Op;
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await RecurringInvoice.findAndCountAll({
            where: { recinvActive: true, recinvNextRun: { [Op.lte]: todayISO() } },
            include: [{
                model: db.Customer, as: 'customer', required: true,
                where: { custCompId: companyId },
                attributes: ['custId', 'custCompId', 'custCompanyName'],
            }],
            limit,
            offset,
            order: [['recinvNextRun', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Recurring invoices due.", companyId, count, limit, offset, recurringInvoices: rows });
    } catch (error) {
        log.error({ err: error }, 'RecurringInvoice due query failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** PATCH /v1/recurringinvoice/:id — partial update. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const sched = await findScoped(req, res);
    if (!sched) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await sched.update(updates);
        return res.status(200).json({ message: "Updated.", recurringInvoice: sched });
    } catch (error) {
        log.error({ err: error }, 'RecurringInvoice.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/recurringinvoice/:id/run — mark the schedule as fired: stamp
 * recinvLastRun with the current due date and advance recinvNextRun by
 * the cadence. 409 if the schedule is inactive. (Generating the invoice
 * document itself reuses the roll-up and is a follow-up.)
 */
exports.run = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const sched = await findScoped(req, res);
    if (!sched) return undefined;

    if (!sched.recinvActive) {
        return res.status(409).json({ message: "Schedule is not active." });
    }

    const previousRun = sched.recinvNextRun;
    const nextRun = advanceDate(previousRun, sched.recinvCadence);
    if (!nextRun) {
        log.error({ recinvId: sched.recinvId, cadence: sched.recinvCadence }, 'advanceDate returned null');
        return res.status(500).json({ message: "Error!" });
    }

    try {
        await sched.update({ recinvLastRun: previousRun, recinvNextRun: nextRun });
        return res.status(200).json({ message: "Schedule advanced.", previousRun, nextRun, recurringInvoice: sched });
    } catch (error) {
        log.error({ err: error }, 'RecurringInvoice run failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/recurringinvoice/:id — soft-delete (sets recinvArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const sched = await findScoped(req, res);
    if (!sched) return undefined;

    try {
        await sched.update({ recinvArch: true });
        return res.status(200).json({ message: "Archived.", id: sched.recinvId });
    } catch (error) {
        log.error({ err: error }, 'RecurringInvoice archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
