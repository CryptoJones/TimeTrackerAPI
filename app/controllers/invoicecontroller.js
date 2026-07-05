// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreateIndirect } = require('./_bulk-helpers.js');
const money = require('../services/money.js');
const { buildRollup } = require('../services/invoice-rollup.js');
const invoiceStatus = require('../services/invoice-status.js');
const Invoice = db.Invoice;

/** Today as an ISO date (YYYY-MM-DD), UTC. */
function todayISO() {
    return new Date().toISOString().slice(0, 10);
}
/** An ISO date `days` after `isoDate` (YYYY-MM-DD), UTC. */
function addDaysISO(isoDate, days) {
    const d = new Date(isoDate + 'T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;

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
        // Eager-load the allocated, unarchived payments (defaultScope
        // hides cpayArch) so the response can carry a derived status +
        // outstanding balance without extra round-trips.
        invoice = await Invoice.findByPk(req.params.id, {
            include: [{ model: db.CustomerPayment, as: 'payments', required: false }],
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
    // Derived (not stored) payment position: status + outstanding balance.
    const billing = invoiceStatus.summarize(invoice, invoice.payments, todayISO());
    return res.status(200).json({ message: "Found.", invoice, billing });
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
 * POST /v1/invoice/rollup
 *
 * Generate an invoice from a customer's billable, uninvoiced,
 * job-linked time. Billable minutes are priced via the rate service
 * (app/services/rate.js) and summed exactly (app/services/money.js),
 * grouped into one InvoiceJob line per Job. The contributing entries
 * are stamped with teInvJobId so they can never be billed twice, and
 * the whole thing — invoice, lines, entry stamps, job flags — commits
 * as one transaction (all or nothing).
 */
exports.rollup = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const custId = Number(req.body && req.body.invCustId);
    if (!Number.isInteger(custId) || custId <= 0) {
        return res.status(400).json({ message: "invCustId is required." });
    }

    let custCompanyId;
    try {
        custCompanyId = await GetCompanyIdByCustomerId(custId);
    } catch (error) {
        log.error({ err: error }, 'rollup: company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    const isMaster = await IsMaster(authKey);
    if (isMaster) {
        if (custCompanyId === -1) {
            return res.status(404).json({ message: "Customer not found." });
        }
    } else {
        const authCompanyId = await GetCompanyId(authKey);
        if (authCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (custCompanyId === -1 || custCompanyId !== authCompanyId) {
            return res.status(403).json({
                message: "Cannot roll up time for a customer in a company you do not belong to.",
            });
        }
    }

    // Billable, job-linked, not-yet-invoiced time for the customer.
    const Op = db.Sequelize && db.Sequelize.Op;
    const where = {
        teCustId: custId,
        teBillable: true,
        teInvJobId: null,
        teJobId: { [Op.ne]: null },
    };
    const from = req.body.from ? new Date(req.body.from + 'T00:00:00.000Z') : null;
    const to = req.body.to ? new Date(req.body.to + 'T23:59:59.999Z') : null;
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
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'rollup: TimeEntry.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const { lines, subtotal, skipped } = buildRollup(entries);
    const skippedCounts = {
        nonBillable: skipped.nonBillable.length,
        noJob: skipped.noJob.length,
        unresolvedRate: skipped.unresolvedRate.length,
    };
    if (lines.length === 0) {
        return res.status(400).json({
            message: "No billable, uninvoiced, job-linked time to roll up for this customer.",
            skipped: skippedCounts,
        });
    }

    const invDate = req.body.invDate || todayISO();
    const invDueDate = req.body.invDueDate || addDaysISO(invDate, 30);
    const tax = 0;
    const total = money.add(subtotal, tax);

    let result;
    try {
        result = await db.sequelize.transaction(async (t) => {
            const invoice = await db.Invoice.create({
                invCustId: custId,
                invDate,
                invDueDate,
                invPaid: false,
                invArch: false,
                invSubtotal: subtotal,
                invTax: tax,
                invTotal: total,
            }, { transaction: t });

            const createdLines = [];
            for (const line of lines) {
                const ij = await db.InvoiceJob.create({
                    injbInvId: invoice.invId,
                    injbJobId: line.jobId,
                    injbAmount: line.amount,
                    injbArch: false,
                }, { transaction: t });
                await db.TimeEntry.update(
                    { teInvJobId: ij.injbId },
                    { where: { teId: line.entryIds }, transaction: t },
                );
                await db.Job.update(
                    { jobInvoiced: true },
                    { where: { jobId: line.jobId }, transaction: t },
                );
                createdLines.push({
                    injbId: ij.injbId,
                    jobId: line.jobId,
                    amount: line.amount,
                    entryCount: line.entryIds.length,
                });
            }
            return { invoice, createdLines };
        });
    } catch (error) {
        log.error({ err: error }, 'rollup: invoice generation transaction failed');
        return res.status(500).json({ message: "Error!" });
    }

    return res.status(201).json({
        message: "Invoice generated from time.",
        invoice: result.invoice,
        lines: result.createdLines,
        subtotal,
        tax,
        total,
        skipped: skippedCounts,
    });
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
