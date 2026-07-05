// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Report controller — read-only analytics over the tracked time and
 * billing data. Company-scoped: master keys pass ?companyId; scoped
 * keys use their own company.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const money = require('../services/money.js');
const { buildUnbilled } = require('../services/report-unbilled.js');
const { buildHours } = require('../services/report-hours.js');
const { buildRevenue } = require('../services/report-revenue.js');
const { buildBillableSummary } = require('../services/report-billable-summary.js');
const { buildTimesheet } = require('../services/report-timesheet.js');

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

/** Parse a strict YYYY-MM-DD into a Date at UTC start/end of day, or null. */
function parseDate(s, endOfDay) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
    return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Resolve the target company from the auth key, enforcing scope.
 * Returns { companyId } or { error: { status, message } }.
 */
async function resolveCompany(req) {
    const isMaster = await IsMaster(req.authKey);
    if (isMaster) {
        const companyId = Number(req.query.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return { error: { status: 400, message: "Master keys must specify companyId." } };
        }
        return { companyId };
    }
    const companyId = await GetCompanyId(req.authKey);
    if (companyId === -1) {
        return { error: { status: 403, message: "Invalid Authorization Key." } };
    }
    if (req.query.companyId !== undefined && Number(req.query.companyId) !== companyId) {
        return { error: { status: 403, message: "Cannot report on a company you do not belong to." } };
    }
    return { companyId };
}

/**
 * GET /v1/report/unbilled — billable time not yet invoiced, grouped
 * customer → job, priced via the rate service. The "money you haven't
 * billed" view that drives the next roll-up. Optional customerId filter
 * and from/to (entry start date) bounds.
 */
exports.unbilled = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    req.authKey = authKey;

    const scope = await resolveCompany(req);
    if (scope.error) {
        return res.status(scope.error.status).json({ message: scope.error.message });
    }
    const { companyId } = scope;

    const Op = db.Sequelize && db.Sequelize.Op;
    const where = {
        teCompId: companyId,
        teBillable: true,
        teInvJobId: null,
        teJobId: { [Op.ne]: null },
    };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) where.teCustId = customerId;
    const from = parseDate(req.query.from, false);
    const to = parseDate(req.query.to, true);
    if (Op && from) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: from });
    if (Op && to) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: to });

    let entries;
    try {
        entries = await db.TimeEntry.findAll({
            where,
            include: [
                { model: db.BillingType, as: 'billingType', required: false },
                {
                    model: db.Worker, as: 'worker', required: false,
                    include: [{ model: db.BillingType, as: 'defaultBillingType', required: false }],
                },
                { model: db.Job, as: 'job', required: false, attributes: ['jobId', 'jobDesc', 'jobFlatRate'] },
                {
                    model: db.Customer, as: 'customer', required: false,
                    attributes: ['custId', 'custCompanyName', 'custFName', 'custLName'],
                },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'unbilled report: TimeEntry.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const items = entries.map((e) => {
        const c = e.customer;
        return {
            teId: e.teId,
            teCustId: e.teCustId,
            teJobId: e.teJobId,
            teMinutes: e.teMinutes,
            teBillable: e.teBillable,
            billingType: e.billingType,
            worker: e.worker,
            // Pass the job so rate.js can read the per-project flat rate (#410).
            job: e.job,
            custName: c ? (c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ') || null) : null,
            jobDesc: e.job ? e.job.jobDesc : null,
        };
    });

    const report = buildUnbilled(items);
    return res.status(200).json({
        message: "Unbilled billable time.",
        companyId,
        totalMinutes: report.totalMinutes,
        totalHours: report.totalHours,
        totalAmount: report.totalAmount,
        unresolvedRateEntries: report.unresolvedRate.length,
        customers: report.customers,
    });
};

/**
 * GET /v1/report/hours — hours summary grouped by customer, job, and
 * worker, each with its billable / non-billable split. Covers all
 * closed time for the company; optional customerId / workerId / from /
 * to filters.
 */
exports.hours = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    req.authKey = authKey;

    const scope = await resolveCompany(req);
    if (scope.error) {
        return res.status(scope.error.status).json({ message: scope.error.message });
    }
    const { companyId } = scope;

    const Op = db.Sequelize && db.Sequelize.Op;
    const where = { teCompId: companyId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) where.teCustId = customerId;
    const workerId = Number(req.query.workerId);
    if (Number.isInteger(workerId) && workerId > 0) where.teWorkerId = workerId;
    const from = parseDate(req.query.from, false);
    const to = parseDate(req.query.to, true);
    if (Op && from) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: from });
    if (Op && to) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: to });

    let entries;
    try {
        entries = await db.TimeEntry.findAll({
            where,
            include: [
                { model: db.Job, as: 'job', required: false, attributes: ['jobId', 'jobDesc', 'jobFlatRate'] },
                {
                    model: db.Customer, as: 'customer', required: false,
                    attributes: ['custId', 'custCompanyName', 'custFName', 'custLName'],
                },
                {
                    model: db.Worker, as: 'worker', required: false,
                    attributes: ['workerId', 'workerFName', 'workerLName'],
                },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'hours report: TimeEntry.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const items = entries.map((e) => {
        const c = e.customer;
        const w = e.worker;
        return {
            teMinutes: e.teMinutes,
            teBillable: e.teBillable,
            teCustId: e.teCustId,
            custName: c ? (c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ') || null) : null,
            teJobId: e.teJobId,
            jobDesc: e.job ? e.job.jobDesc : null,
            teWorkerId: e.teWorkerId,
            workerName: w ? ([w.workerFName, w.workerLName].filter(Boolean).join(' ') || null) : null,
        };
    });

    const report = buildHours(items);
    return res.status(200).json({ message: "Hours summary.", companyId, ...report });
};

/**
 * GET /v1/report/revenue — revenue (invoiced) and collected (paid)
 * summary, grouped by customer and by month, with outstanding. Covers
 * the company's invoices; optional customerId and from/to (invoice
 * date) filters.
 */
exports.revenue = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    req.authKey = authKey;

    const scope = await resolveCompany(req);
    if (scope.error) {
        return res.status(scope.error.status).json({ message: scope.error.message });
    }
    const { companyId } = scope;

    const Op = db.Sequelize && db.Sequelize.Op;
    const invWhere = {};
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) invWhere.invCustId = customerId;
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (Op && /^\d{4}-\d{2}-\d{2}$/.test(from)) invWhere.invDate = Object.assign(invWhere.invDate || {}, { [Op.gte]: from });
    if (Op && /^\d{4}-\d{2}-\d{2}$/.test(to)) invWhere.invDate = Object.assign(invWhere.invDate || {}, { [Op.lte]: to });

    let invoices;
    try {
        invoices = await db.Invoice.findAll({
            where: invWhere,
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
    } catch (error) {
        log.error({ err: error }, 'revenue report: Invoice.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

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

    const report = buildRevenue(items);
    return res.status(200).json({ message: "Revenue summary.", companyId, ...report });
};

/**
 * GET /v1/report/billable-summary — billable vs non-billable time split
 * by month, with the overall billable ratio and the billable amount.
 * Company-scoped; optional customerId and from/to (entry start) filters.
 */
exports.billableSummary = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    req.authKey = authKey;

    const scope = await resolveCompany(req);
    if (scope.error) {
        return res.status(scope.error.status).json({ message: scope.error.message });
    }
    const { companyId } = scope;

    const Op = db.Sequelize && db.Sequelize.Op;
    const where = { teCompId: companyId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) where.teCustId = customerId;
    const from = parseDate(req.query.from, false);
    const to = parseDate(req.query.to, true);
    if (Op && from) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: from });
    if (Op && to) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: to });

    let entries;
    try {
        entries = await db.TimeEntry.findAll({
            where,
            include: [
                { model: db.BillingType, as: 'billingType', required: false },
                { model: db.Job, as: 'job', required: false, attributes: ['jobId', 'jobFlatRate'] },
                {
                    model: db.Worker, as: 'worker', required: false,
                    include: [{ model: db.BillingType, as: 'defaultBillingType', required: false }],
                },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'billable-summary: TimeEntry.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const report = buildBillableSummary(entries);
    return res.status(200).json({ message: "Billable vs non-billable summary.", companyId, ...report });
};

/**
 * GET /v1/report/timesheet — a timesheet grid: hours per worker per day
 * (period=day, default) or per week (period=week) over the range.
 * Company-scoped; optional customerId / workerId / from / to.
 */
exports.timesheet = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    req.authKey = authKey;

    const scope = await resolveCompany(req);
    if (scope.error) {
        return res.status(scope.error.status).json({ message: scope.error.message });
    }
    const { companyId } = scope;

    const Op = db.Sequelize && db.Sequelize.Op;
    const where = { teCompId: companyId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) where.teCustId = customerId;
    const workerId = Number(req.query.workerId);
    if (Number.isInteger(workerId) && workerId > 0) where.teWorkerId = workerId;
    const from = parseDate(req.query.from, false);
    const to = parseDate(req.query.to, true);
    if (Op && from) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: from });
    if (Op && to) where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: to });

    let entries;
    try {
        entries = await db.TimeEntry.findAll({
            where,
            include: [{ model: db.Worker, as: 'worker', required: false, attributes: ['workerId', 'workerFName', 'workerLName'] }],
        });
    } catch (error) {
        log.error({ err: error }, 'timesheet: TimeEntry.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const items = entries.map((e) => {
        const w = e.worker;
        return {
            teMinutes: e.teMinutes,
            teStartedAt: e.teStartedAt,
            teWorkerId: e.teWorkerId,
            workerName: w ? ([w.workerFName, w.workerLName].filter(Boolean).join(' ') || null) : null,
        };
    });

    const report = buildTimesheet(items, req.query.period);
    return res.status(200).json({ message: "Timesheet.", companyId, ...report });
};

exports._internals = { resolveCompany, parseDate };
