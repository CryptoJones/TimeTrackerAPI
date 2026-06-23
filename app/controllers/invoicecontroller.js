// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const money = require('../services/money.js');
const { renderInvoicePdf } = require('../services/invoice-pdf.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreateIndirect } = require('./_bulk-helpers.js');
const Invoice = db.Invoice;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;
const GetCompanyIdByJobId = auth.getCompanyIdByJobId;

const ALLOWED_FIELDS_CREATE = ['invCustId', 'invDate', 'invDueDate', 'invPaid'];
const ALLOWED_FIELDS_UPDATE = ['invDate', 'invDueDate', 'invPaid'];

exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    if (!payload.invCustId) {
        return res.status(400).json({ message: "invCustId is required." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        if (authCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const custCompanyId = await GetCompanyIdByCustomerId(payload.invCustId);
        if (custCompanyId === -1 || custCompanyId !== authCompanyId) {
            return res.status(403).json({
                message: "Cannot create an invoice for a customer in a company you do not belong to.",
            });
        }
    }

    if (payload.invPaid === undefined) payload.invPaid = false;
    payload.invArch = false;

    try {
        const created = await Invoice.create(payload);
        return res.status(201).json({ message: "Invoice created.", invoice: created });
    } catch (error) {
        log.error({ err: error }, 'Invoice.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        // Eager-load line items + applied payments so the response can
        // carry the money summary (total / paid / balance / status).
        // Includes are best-effort: the money module treats a missing
        // association as an empty list.
        invoice = await Invoice.findByPk(req.params.id, {
            include: [
                { model: db.InvoiceJob, as: 'lines', required: false },
                { model: db.CustomerPayment, as: 'payments', required: false },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        // Cross-tenant access is reported as 404, not 403 — otherwise
        // a scoped caller can enumerate which Invoice ids are
        // populated across the whole tenant table by status code.
        // Same secure-404 pattern as the prior 11 entities (#174 /
        // #188 / #192 / #196 / #200 / #204 / #210 / #214 / #218 /
        // #222 / #226).
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    const summary = money.summarize(invoice, invoice.lines, invoice.payments);
    return res.status(200).json({ message: "Found.", invoice, ...summary });
};

exports.listByCustomer = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetCustomerId = Number(req.params.id);
    if (!Number.isInteger(targetCustomerId) || targetCustomerId <= 0) {
        return res.status(400).json({ message: "Invalid customer id." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const custCompanyId = await GetCompanyIdByCustomerId(targetCustomerId);
        if (authCompanyId === -1 || custCompanyId === -1 || authCompanyId !== custCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;

    try {
        const { count, rows } = await Invoice.findAndCountAll({
            where: { invCustId: targetCustomerId },
            limit, offset,
            order: [['invId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved invoices for CustomerId " + targetCustomerId,
            count, limit, offset, invoices: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Invoice.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        // Secure-404 on PATCH for the same reason as GET.
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
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

    try {
        await invoice.update(updates);
        return res.status(200).json({ message: "Updated.", invoice });
    } catch (error) {
        log.error({ err: error }, 'Invoice.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        // Secure-404 on DELETE for the same reason as GET / PATCH.
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await invoice.update({ invArch: true });
        return res.status(200).json({ message: "Archived.", id: invoice.invId });
    } catch (error) {
        log.error({ err: error }, 'Invoice archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/invoice/:id/payment
 *
 * Record a full or partial payment against an invoice. Writes a
 * CustomerPayment linked to the invoice (cpayInvId) and its customer,
 * then recomputes the invoice's status + invPaid mirror from the full
 * payment set. Wrapped in a transaction so a payment never lands
 * without its status update. Idempotent via the global Idempotency-Key
 * layer — critical for a money-moving POST.
 */
exports.recordPayment = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id, {
            include: [
                { model: db.InvoiceJob, as: 'lines', required: false },
                { model: db.CustomerPayment, as: 'payments', required: false },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk (recordPayment) failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        // Secure-404 on cross-tenant, same as getById/update.
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const body = req.body || {};
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "amount is required and must be a positive number." });
    }
    const date = body.date || new Date().toISOString().slice(0, 10);

    const t = await db.sequelize.transaction();
    try {
        const payment = await db.CustomerPayment.create({
            cpayInvId: invoice.invId,
            cpayCustId: invoice.invCustId,
            cpayAmount: money.roundCents(amount),
            cpayDate: date,
            cpayDescription: body.description,
            cpayArch: false,
        }, { transaction: t });

        // Recompute from the full payment set (existing + the new one).
        const payments = [...(invoice.payments || []), payment];
        const total = money.invoiceTotal(invoice.lines);
        const paid = money.invoicePaid(payments);
        const balance = money.invoiceBalance(total, paid);
        const status = money.deriveStatus({ total, paid, currentStatus: invoice.invStatus });
        await invoice.update(
            { invStatus: status, invPaid: balance <= 0 && total > 0 },
            { transaction: t },
        );
        await t.commit();
        return res.status(201).json({
            message: "Payment recorded.", payment, total, paid, balance, status,
        });
    } catch (error) {
        if (t && typeof t.rollback === 'function') await t.rollback();
        log.error({ err: error }, 'Invoice.recordPayment failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/invoice/from-job/:id
 *
 * Auto-bill a job: gather its billable, un-invoiced, closed time
 * entries, compute Σ(hours × rate) (rate from each entry's billing type,
 * else the worker's default), create a draft Invoice + one InvoiceJob
 * line for the total, and mark the billed entries consumed
 * (teInvoiceJobId) so they can't be billed twice. Transaction-wrapped.
 */
exports.createFromJob = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const jobId = Number(req.params.id);

    let job;
    try {
        job = await db.Job.findByPk(jobId);
    } catch (error) {
        log.error({ err: error }, 'Job.findByPk (createFromJob) failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!job || job.jobArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByJobId(jobId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const Op = db.Sequelize && db.Sequelize.Op;
    let entries;
    try {
        entries = await db.TimeEntry.findAll({
            where: {
                teJobId: jobId,
                teBillable: true,
                teInvoiceJobId: null,
                teMinutes: Op ? { [Op.ne]: null } : null,
            },
        });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findAll (createFromJob) failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!entries.length) {
        return res.status(400).json({
            message: "No billable, un-invoiced time entries to bill for this job.",
        });
    }

    // Resolve rate maps: explicit billing types + worker defaults.
    const billTypeIds = new Set();
    const workerIds = new Set();
    for (const e of entries) {
        if (e.teBillTypeId != null) billTypeIds.add(e.teBillTypeId);
        if (e.teWorkerId != null) workerIds.add(e.teWorkerId);
    }
    const defaultBillTypeByWorkerId = new Map();
    try {
        if (workerIds.size) {
            const workers = await db.Worker.findAll({
                where: { workerId: [...workerIds] },
                attributes: ['workerId', 'workerDefaultBillType'],
            });
            for (const w of workers) {
                defaultBillTypeByWorkerId.set(w.workerId, w.workerDefaultBillType);
                if (w.workerDefaultBillType != null) billTypeIds.add(w.workerDefaultBillType);
            }
        }
        const rateByBillTypeId = new Map();
        if (billTypeIds.size) {
            const bts = await db.BillingType.findAll({
                where: { btId: [...billTypeIds] },
                attributes: ['btId', 'btHourlyRate'],
            });
            for (const bt of bts) rateByBillTypeId.set(bt.btId, bt.btHourlyRate);
        }

        const { amount, billedEntryIds, unratedCount } =
            money.computeJobBill(entries, rateByBillTypeId, defaultBillTypeByWorkerId);
        if (billedEntryIds.length === 0) {
            return res.status(400).json({
                message: "No rateable time entries (set a billing type or a worker default rate).",
            });
        }

        const invDate = (req.body && req.body.invDate) || new Date().toISOString().slice(0, 10);
        const netDays = req.body && Number.isInteger(Number(req.body.netDays))
            ? Number(req.body.netDays) : 30;
        const due = new Date(invDate + 'T00:00:00Z');
        due.setUTCDate(due.getUTCDate() + netDays);
        const invDueDate = due.toISOString().slice(0, 10);

        const t = await db.sequelize.transaction();
        try {
            const invoice = await db.Invoice.create({
                invCustId: job.jobCustId, invDate, invDueDate,
                invPaid: false, invStatus: 'draft', invArch: false,
            }, { transaction: t });
            const line = await db.InvoiceJob.create({
                injbInvId: invoice.invId, injbJobId: jobId,
                injbAmount: amount, injbArch: false,
            }, { transaction: t });
            await db.TimeEntry.update(
                { teInvoiceJobId: line.injbId },
                { where: { teId: billedEntryIds }, transaction: t },
            );
            await t.commit();
            return res.status(201).json({
                message: "Invoice created from job.",
                invoice, line, amount,
                billedCount: billedEntryIds.length, unratedCount,
            });
        } catch (error) {
            if (t && typeof t.rollback === 'function') await t.rollback();
            throw error;
        }
    } catch (error) {
        log.error({ err: error }, 'Invoice.createFromJob failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/invoice/:id/carry-forward
 *
 * Re-issue an invoice's outstanding balance onto a new draft invoice for
 * the same customer: one "balance brought forward" line (a job-less
 * InvoiceJob) for the balance, linked back via invBalanceForwardFrom.
 * By default the original is marked `void` so its balance isn't
 * double-counted (set voidOriginal:false to keep it open).
 */
exports.createCarryForward = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let prior;
    try {
        prior = await Invoice.findByPk(req.params.id, {
            include: [
                { model: db.InvoiceJob, as: 'lines', required: false },
                { model: db.CustomerPayment, as: 'payments', required: false },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk (carryForward) failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!prior || prior.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(prior.invCustId);
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const { balance } = money.summarize(prior, prior.lines, prior.payments);
    if (balance <= 0) {
        return res.status(400).json({ message: "Nothing to carry forward — the invoice has no outstanding balance." });
    }

    const body = req.body || {};
    const invDate = body.invDate || new Date().toISOString().slice(0, 10);
    const netDays = Number.isInteger(Number(body.netDays)) ? Number(body.netDays) : 30;
    const due = new Date(invDate + 'T00:00:00Z');
    due.setUTCDate(due.getUTCDate() + netDays);
    const invDueDate = due.toISOString().slice(0, 10);
    const voidOriginal = body.voidOriginal !== false; // default true

    const t = await db.sequelize.transaction();
    try {
        const invoice = await db.Invoice.create({
            invCustId: prior.invCustId, invDate, invDueDate,
            invPaid: false, invStatus: 'draft', invArch: false,
            invBalanceForwardFrom: prior.invId,
        }, { transaction: t });
        const line = await db.InvoiceJob.create({
            injbInvId: invoice.invId, injbJobId: null,
            injbAmount: balance, injbArch: false,
        }, { transaction: t });
        if (voidOriginal) {
            await prior.update({ invStatus: 'void' }, { transaction: t });
        }
        await t.commit();
        return res.status(201).json({
            message: "Balance carried forward to a new invoice.",
            invoice, line, carriedBalance: balance, voidedOriginal: voidOriginal,
        });
    } catch (error) {
        if (t && typeof t.rollback === 'function') await t.rollback();
        log.error({ err: error }, 'Invoice.createCarryForward failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/invoice/:id/pdf — render the invoice as a PDF download
 * (the freelancer's deliverable). Company-scoped, secure-404.
 */
exports.getPdf = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id, {
            include: [
                { model: db.InvoiceJob, as: 'lines', required: false },
                { model: db.CustomerPayment, as: 'payments', required: false },
                {
                    model: db.Customer, as: 'customer', required: false,
                    include: [{ model: db.Company, as: 'company', required: false }],
                },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk (getPdf) failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        const summary = money.summarize(invoice, invoice.lines, invoice.payments);
        const pdf = await renderInvoicePdf({
            invoice,
            lines: invoice.lines,
            payments: invoice.payments,
            customer: invoice.customer,
            company: invoice.customer && invoice.customer.company,
            summary,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invId}.pdf"`);
        return res.status(200).send(pdf);
    } catch (error) {
        log.error({ err: error }, 'Invoice.getPdf render failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.bulkCreate = makeBulkCreateIndirect({
    Model: Invoice,
    modelKey: 'Invoice',
    parentFkField: 'invCustId',
    resolveParentCompanyId: auth.getCompanyIdByCustomerId,
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'invArch',
    bodyKey: 'invoices',
    createdKey: 'invoices',
});

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByCustomerId };
