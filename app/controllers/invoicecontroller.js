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
const invoiceNumber = require('../services/invoice-number.js');
const { renderInvoicePdf } = require('../services/invoice-pdf.js');
const { buildAging } = require('../services/invoice-aging.js');
const invoiceTax = require('../services/invoice-tax.js');
const { buildExpenseRollup } = require('../services/expense-rollup.js');
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

const ALLOWED_FIELDS_CREATE = ['invCustId', 'invDate', 'invDueDate', 'invPaid', 'invNotes'];
const ALLOWED_FIELDS_UPDATE = ['invDate', 'invDueDate', 'invPaid', 'invWriteOff', 'invNotes'];

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

    // The invoice's company is the customer's company — resolved once
    // for both the scope check and invoice numbering.
    const isMaster = await IsMaster(authKey);
    let custCompanyId;
    try {
        custCompanyId = await GetCompanyIdByCustomerId(payload.invCustId);
    } catch (error) {
        log.error({ err: error }, 'Invoice create: company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
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
                message: "Cannot create an invoice for a customer in a company you do not belong to.",
            });
        }
    }

    if (payload.invPaid === undefined) payload.invPaid = false;
    payload.invArch = false;

    try {
        // Allocate the invoice number and create the row in one
        // transaction so a concurrent create can't reuse the sequence.
        const created = await db.sequelize.transaction(async (t) => {
            payload.invNumber = await invoiceNumber.allocateNumber(db, custCompanyId, t);
            return Invoice.create(payload, { transaction: t });
        });
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
                // Job flat rate (#410) — resolveHourlyRate reads entry.job.
                { model: db.Job, as: 'job', required: false, attributes: ['jobId', 'jobFlatRate'] },
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

    const { lines, subtotal: timeSubtotal, skipped } = buildRollup(entries);
    const skippedCounts = {
        nonBillable: skipped.nonBillable.length,
        noJob: skipped.noJob.length,
        unresolvedRate: skipped.unresolvedRate.length,
    };

    // Optionally roll the customer's billable, un-invoiced expenses in too
    // (#418). Same date window as the time filter.
    let expenseRollup = { lines: [], subtotal: 0, skipped: { nonBillable: [] } };
    if (req.body.includeExpenses) {
        const expWhere = { expCustId: custId, expBillable: true, expInvId: null };
        if (Op && from) expWhere.expDate = Object.assign(expWhere.expDate || {}, { [Op.gte]: req.body.from });
        if (Op && to) expWhere.expDate = Object.assign(expWhere.expDate || {}, { [Op.lte]: req.body.to });
        let expenseRows;
        try {
            expenseRows = await db.Expense.findAll({ where: expWhere });
        } catch (error) {
            log.error({ err: error }, 'rollup: Expense.findAll failed');
            return res.status(500).json({ message: "Error!" });
        }
        expenseRollup = buildExpenseRollup(expenseRows);
    }

    // Combined pre-discount subtotal: billable time + billable expenses.
    const subtotal = money.add(timeSubtotal, expenseRollup.subtotal);

    if (lines.length === 0 && expenseRollup.lines.length === 0) {
        return res.status(400).json({
            message: "No billable, uninvoiced time or expenses to roll up for this customer.",
            skipped: skippedCounts,
        });
    }

    const invDate = req.body.invDate || todayISO();
    const invDueDate = req.body.invDueDate || addDaysISO(invDate, 30);
    // Effective tax rate: explicit body override → company default → 0.
    let companyDefaultRate = 0;
    if (req.body.taxRate == null) {
        try {
            const company = await db.Company.findByPk(custCompanyId, { attributes: ['compTaxRate'] });
            companyDefaultRate = company ? company.compTaxRate : 0;
        } catch (error) {
            log.error({ err: error }, 'rollup: company tax-rate lookup failed');
            return res.status(500).json({ message: "Error!" });
        }
    }
    const taxRate = invoiceTax.resolveRate({ override: req.body.taxRate, companyDefault: companyDefaultRate });
    // Discount applies to the subtotal before tax; clamp to [0, subtotal].
    let discount = Number(req.body.discount);
    if (!Number.isFinite(discount) || discount < 0) discount = 0;
    if (money.subtract(subtotal, discount) < 0) discount = subtotal;
    discount = money.round(discount);
    const taxableBase = money.subtract(subtotal, discount);
    const tax = invoiceTax.computeTax(taxableBase, taxRate);
    const total = money.add(taxableBase, tax);

    let result;
    try {
        result = await db.sequelize.transaction(async (t) => {
            const invNumber = await invoiceNumber.allocateNumber(db, custCompanyId, t);
            const invoice = await db.Invoice.create({
                invCustId: custId,
                invNumber,
                invDate,
                invDueDate,
                invPaid: false,
                invArch: false,
                invSubtotal: subtotal,
                invDiscount: discount,
                invTax: tax,
                invTotal: total,
                invTaxRate: taxRate,
                invNotes: req.body.notes,
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
            // Attach rolled expenses to this invoice — stamping expInvId
            // both links them and marks them invoiced (won't re-roll).
            const expenseIds = expenseRollup.lines.map((l) => l.expId);
            if (expenseIds.length) {
                await db.Expense.update(
                    { expInvId: invoice.invId },
                    { where: { expId: expenseIds }, transaction: t },
                );
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
        expenses: {
            count: expenseRollup.lines.length,
            subtotal: expenseRollup.subtotal,
            lines: expenseRollup.lines,
        },
        subtotal,
        tax,
        total,
        skipped: skippedCounts,
    });
};

/**
 * GET /v1/invoice/aging — accounts-receivable aging for a company.
 * Buckets outstanding invoice balances by days overdue (current /
 * 1-30 / 31-60 / 61-90 / 90+). Master keys must pass ?companyId; scoped
 * keys use their own company.
 */
exports.aging = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await IsMaster(authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.query.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master keys must specify companyId." });
        }
    } else {
        companyId = await GetCompanyId(authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (req.query.companyId !== undefined && Number(req.query.companyId) !== companyId) {
            return res.status(403).json({
                message: "Cannot view AR aging for a company you do not belong to.",
            });
        }
    }

    let invoices;
    try {
        // Invoice scopes through Customer (no compId column), so join the
        // customer and filter by company. defaultScope hides archived
        // invoices / customers / payments.
        invoices = await Invoice.findAll({
            include: [
                {
                    model: db.Customer, as: 'customer', required: true,
                    where: { custCompId: companyId },
                    attributes: ['custCompanyName', 'custFName', 'custLName'],
                },
                { model: db.CustomerPayment, as: 'payments', required: false },
            ],
            order: [['invDueDate', 'ASC']],
        });
    } catch (error) {
        log.error({ err: error }, 'AR aging: Invoice.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const today = todayISO();
    const items = invoices.map((inv) => {
        const summary = invoiceStatus.summarize(inv, inv.payments, today);
        const c = inv.customer;
        const custName = c
            ? (c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ') || null)
            : null;
        return {
            invId: inv.invId,
            invNumber: inv.invNumber,
            custName,
            dueDate: inv.invDueDate,
            balance: summary.balance,
        };
    });

    const aging = buildAging(items, today);
    return res.status(200).json({
        message: "AR aging.",
        companyId,
        asOf: today,
        buckets: aging.buckets,
        totalOutstanding: aging.totalOutstanding,
        invoices: aging.invoices,
    });
};

/**
 * GET /v1/invoice/:id/pdf — stream a branded PDF of the invoice
 * (company header, bill-to, line items, totals, balance). Same
 * secure-404 scoping as getById.
 */
exports.pdf = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id, {
            include: [
                {
                    model: db.InvoiceJob, as: 'lines', required: false,
                    include: [{ model: db.Job, as: 'job', required: false }],
                },
                { model: db.CustomerPayment, as: 'payments', required: false },
                {
                    model: db.Customer, as: 'customer', required: false,
                    include: [{ model: db.Company, as: 'company', required: false }],
                },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk (pdf) failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        // Secure-404 on cross-tenant, same rationale as getById.
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const billing = invoiceStatus.summarize(invoice, invoice.payments, todayISO());
    const cust = invoice.customer || null;
    const company = cust && cust.company ? cust.company : null;
    const custName = cust
        ? (cust.custCompanyName || [cust.custFName, cust.custLName].filter(Boolean).join(' ') || null)
        : null;
    const data = {
        company: company ? {
            name: company.compName,
            address1: company.compAddress1, address2: company.compAddress2,
            city: company.compCity, state: company.compState, zip: company.compZip,
            phone: company.compPhone, email: company.compEmail,
            footer: company.compInvFooter,
        } : null,
        customer: { name: custName },
        invoice: { number: invoice.invNumber, date: invoice.invDate, dueDate: invoice.invDueDate, notes: invoice.invNotes },
        lines: (invoice.lines || []).map((l) => ({
            description: (l.job && l.job.jobDesc) || `Job #${l.injbJobId}`,
            amount: l.injbAmount == null ? null : Number(l.injbAmount),
        })),
        totals: { subtotal: invoice.invSubtotal, tax: invoice.invTax, total: invoice.invTotal },
        payment: billing,
        format: req.query.format, // 'summary' | 'detailed' (default) — #424
    };

    let pdf;
    try {
        pdf = await renderInvoicePdf(data);
    } catch (error) {
        log.error({ err: error }, 'Invoice PDF render failed');
        return res.status(500).json({ message: "Error!" });
    }

    const safeName = String(invoice.invNumber || invoice.invId).replace(/[^A-Za-z0-9._-]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${safeName}.pdf"`);
    return res.status(200).send(pdf);
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
