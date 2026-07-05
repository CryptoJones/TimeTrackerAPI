// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { billableAmount } = require('../services/expense-billing.js');
const Expense = db.Expense;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = [
    'expCustId', 'expJobId', 'expCategory', 'expDescription', 'expDate', 'expAmount',
    'expBillable', 'expMarkupPct',
];
const ALLOWED_FIELDS_UPDATE = [
    'expCustId', 'expJobId', 'expCategory', 'expDescription', 'expDate', 'expAmount',
    'expBillable', 'expMarkupPct',
];

const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Validate the optional customer / job links against the expense's
 * company. Each is optional; a `null` (update, to unlink) is skipped.
 * Returns `null` when legal, else a `{ status, message }` the caller
 * sends as-is. Archived rows read as "not found" → 400. When both a
 * customer and a job are given, the job must belong to that customer,
 * so an expense can't be booked to one client's project under another
 * client.
 */
async function checkExpenseLinks({ expCustId, expJobId }, companyId) {
    let custId = null;
    if (expCustId !== undefined && expCustId !== null) {
        const cust = await db.Customer.findByPk(Number(expCustId), { attributes: ['custCompId'] });
        if (!cust || cust.custCompId !== companyId) {
            return { status: 400, message: 'expCustId must reference a customer in your company.' };
        }
        custId = Number(expCustId);
    }
    if (expJobId !== undefined && expJobId !== null) {
        const job = await db.Job.findByPk(Number(expJobId), {
            attributes: ['jobCustId'],
            include: [{ model: db.Customer, as: 'customer', attributes: ['custCompId'], required: true }],
        });
        if (!job || !job.customer || job.customer.custCompId !== companyId) {
            return { status: 400, message: 'expJobId must reference a job in your company.' };
        }
        if (custId !== null && job.jobCustId !== custId) {
            return { status: 400, message: 'expJobId must belong to the same customer as expCustId.' };
        }
    }
    return null;
}

/**
 * POST /v1/expense — record an expense in the auth'd company. Master
 * keys must set expCompId; non-master keys are scoped to their company.
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await IsMaster(authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.body && req.body.expCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify expCompId." });
        }
    } else {
        companyId = await GetCompanyId(authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (req.body && req.body.expCompId !== undefined && Number(req.body.expCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot create an expense for a company you do not belong to." });
        }
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    payload.expCompId = companyId;
    payload.expArch = false;

    let linkError;
    try {
        linkError = await checkExpenseLinks(payload, companyId);
    } catch (error) {
        log.error({ err: error }, 'Expense customer/job link validation failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (linkError) {
        return res.status(linkError.status).json({ message: linkError.message });
    }

    try {
        const created = await Expense.create(payload);
        return res.status(201).json({ message: "Expense created.", expense: created });
    } catch (error) {
        log.error({ err: error }, 'Expense.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/expense/:id — fetch one expense. Secure-404 scoped: a
 * cross-tenant id reads as 404, not 403.
 */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let expense;
    try {
        expense = await Expense.findByPk(req.params.id, {
            include: [
                { model: db.Customer, as: 'customer', required: false },
                { model: db.Job, as: 'job', required: false },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'Expense.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!expense || expense.expArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || expense.expCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    // Computed billing view: what the client would be charged for this
    // expense (0 if not billable, else cost × (1 + markup)). Derived.
    return res.status(200).json({
        message: "Found.",
        expense,
        billing: { billableAmount: billableAmount(expense) },
    });
};

/**
 * GET /v1/expense/bycompany/:id — list a company's expenses. Honors
 * ?customerId, ?jobId, ?from / ?to (expDate range), and pagination.
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

    const where = { expCompId: targetCompanyId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) where.expCustId = customerId;
    const jobId = Number(req.query.jobId);
    if (Number.isInteger(jobId) && jobId > 0) where.expJobId = jobId;
    const Op = db.Sequelize && db.Sequelize.Op;
    if (Op && isISODate(req.query.from)) where.expDate = Object.assign(where.expDate || {}, { [Op.gte]: req.query.from });
    if (Op && isISODate(req.query.to)) where.expDate = Object.assign(where.expDate || {}, { [Op.lte]: req.query.to });

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await Expense.findAndCountAll({
            where,
            limit,
            offset,
            order: [['expDate', 'DESC'], ['expId', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, expenses: rows });
    } catch (error) {
        log.error({ err: error }, 'Expense.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * PATCH /v1/expense/:id — partial update. expCompId / expArch are
 * server-managed and not settable here.
 */
exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let expense;
    try {
        expense = await Expense.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Expense.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!expense || expense.expArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || expense.expCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
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

    let linkError;
    try {
        linkError = await checkExpenseLinks(updates, expense.expCompId);
    } catch (error) {
        log.error({ err: error }, 'Expense customer/job link validation failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (linkError) {
        return res.status(linkError.status).json({ message: linkError.message });
    }

    try {
        await expense.update(updates);
        return res.status(200).json({ message: "Updated.", expense });
    } catch (error) {
        log.error({ err: error }, 'Expense.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * DELETE /v1/expense/:id — soft-delete (sets expArch = true).
 */
exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let expense;
    try {
        expense = await Expense.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Expense.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!expense || expense.expArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || expense.expCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await expense.update({ expArch: true });
        return res.status(200).json({ message: "Archived.", id: expense.expId });
    } catch (error) {
        log.error({ err: error }, 'Expense archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports._internals = { checkExpenseLinks, IsMaster, GetCompanyId };
