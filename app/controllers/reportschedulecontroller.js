// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const money = require('../services/money.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { advanceDate } = require('../services/recurring-schedule.js');
const { buildRevenue } = require('../services/report-revenue.js');
const { formatReport } = require('../services/report-email.js');
const { sendMail } = require('../services/mailer.js');
const ReportSchedule = db.ReportSchedule;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_UPDATE = ['rptschReport', 'rptschTo', 'rptschCadence', 'rptschNextRun', 'rptschActive'];

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

/** Load a schedule and enforce the secure-404 company scope. */
async function findScoped(req, res) {
    let sched;
    try {
        sched = await ReportSchedule.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'ReportSchedule.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!sched || sched.rptschArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await IsMaster(req.get('authKey'));
    if (!isMaster) {
        const companyId = await GetCompanyId(req.get('authKey'));
        if (companyId === -1 || sched.rptschCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return sched;
}

/** POST /v1/reportschedule — schedule a report for delivery. */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMaster;
    try {
        isMaster = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }

    const body = req.body || {};
    let companyId;
    if (!isMaster) {
        try {
            companyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (body.rptschCompId !== undefined && Number(body.rptschCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot schedule a report for a company you do not belong to." });
        }
    } else {
        companyId = Number(body.rptschCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify rptschCompId." });
        }
    }

    try {
        const created = await ReportSchedule.create({
            rptschCompId: companyId,
            rptschReport: body.rptschReport,
            rptschTo: body.rptschTo,
            rptschCadence: body.rptschCadence,
            rptschNextRun: body.rptschNextRun,
            rptschActive: true,
            rptschArch: false,
        });
        return res.status(201).json({ message: "Report scheduled.", reportSchedule: created });
    } catch (error) {
        log.error({ err: error }, 'ReportSchedule.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/reportschedule/:id — fetch one. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const sched = await findScoped(req, res);
    if (!sched) return undefined;
    return res.status(200).json({ message: "Found.", reportSchedule: sched });
};

/** GET /v1/reportschedule/bycompany/:id — list a company's schedules. */
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

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await ReportSchedule.findAndCountAll({
            where: { rptschCompId: targetCompanyId },
            limit,
            offset,
            order: [['rptschNextRun', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, reportSchedules: rows });
    } catch (error) {
        log.error({ err: error }, 'ReportSchedule.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/reportschedule/due — active schedules due on/before today. */
exports.listDue = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await IsMaster(authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.query.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify companyId." });
        }
    } else {
        companyId = await GetCompanyId(authKey);
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
        const { count, rows } = await ReportSchedule.findAndCountAll({
            where: { rptschCompId: companyId, rptschActive: true, rptschNextRun: { [Op.lte]: todayISO() } },
            limit,
            offset,
            order: [['rptschNextRun', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Report schedules due.", companyId, count, limit, offset, reportSchedules: rows });
    } catch (error) {
        log.error({ err: error }, 'ReportSchedule due query failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** Build the revenue report for a company (same shape as GET /v1/report/revenue). */
async function buildRevenueReport(companyId) {
    const invoices = await db.Invoice.findAll({
        where: { invArch: false },
        include: [
            {
                model: db.Customer, as: 'customer', required: true,
                where: { custCompId: companyId },
                attributes: ['custId', 'custCompanyName', 'custFName', 'custLName'],
            },
            { model: db.CustomerPayment, as: 'payments', required: false },
        ],
        order: [['invDate', 'ASC']],
    });
    const items = invoices.map((inv) => {
        const c = inv.customer;
        return {
            custId: inv.invCustId,
            custName: c ? (c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ') || null) : null,
            invDate: inv.invDate,
            total: inv.invTotal,
            collected: money.sum((inv.payments || []).map((p) => p.cpayAmount)),
        };
    });
    return buildRevenue(items);
}

/**
 * POST /v1/reportschedule/:id/run — render the report, email it, and
 * advance the schedule by its cadence. 409 if inactive.
 */
exports.run = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const sched = await findScoped(req, res);
    if (!sched) return undefined;

    if (!sched.rptschActive) {
        return res.status(409).json({ message: "Schedule is not active." });
    }

    let report;
    let company;
    try {
        report = await buildRevenueReport(sched.rptschCompId);
        company = await db.Company.findByPk(sched.rptschCompId, { attributes: ['compName'] });
    } catch (error) {
        log.error({ err: error }, 'report schedule run: build failed');
        return res.status(500).json({ message: "Error!" });
    }

    const { subject, text } = formatReport(sched.rptschReport, report, {
        company: company ? company.compName : null,
        generatedAt: todayISO(),
    });

    try {
        await sendMail({ to: sched.rptschTo, subject, text });
    } catch (error) {
        log.error({ err: error }, 'report schedule run: sendMail failed');
        return res.status(500).json({ message: "Error!" });
    }

    const previousRun = sched.rptschNextRun;
    const nextRun = advanceDate(previousRun, sched.rptschCadence);
    if (!nextRun) {
        log.error({ rptschId: sched.rptschId, cadence: sched.rptschCadence }, 'advanceDate returned null');
        return res.status(500).json({ message: "Error!" });
    }
    try {
        await sched.update({ rptschLastRun: previousRun, rptschNextRun: nextRun });
    } catch (error) {
        log.error({ err: error }, 'report schedule run: advance failed');
        return res.status(500).json({ message: "Error!" });
    }

    return res.status(200).json({ message: "Report delivered.", to: sched.rptschTo, previousRun, nextRun });
};

/** PATCH /v1/reportschedule/:id — partial update. */
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
        return res.status(200).json({ message: "Updated.", reportSchedule: sched });
    } catch (error) {
        log.error({ err: error }, 'ReportSchedule.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/reportschedule/:id — soft-delete (sets rptschArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const sched = await findScoped(req, res);
    if (!sched) return undefined;

    try {
        await sched.update({ rptschArch: true });
        return res.status(200).json({ message: "Archived.", id: sched.rptschId });
    } catch (error) {
        log.error({ err: error }, 'ReportSchedule archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
