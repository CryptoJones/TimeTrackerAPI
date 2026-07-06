// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { anonymizedValues } = require('../services/gdpr.js');

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

/** Load a customer and enforce the secure-404 company scope. */
async function findScopedCustomer(req, res) {
    let customer;
    try {
        customer = await db.Customer.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'gdpr: Customer.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!customer || customer.custArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await MasterFromReq(req, req.get('authKey'));
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, req.get('authKey'));
        if (companyId === -1 || customer.custCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return customer;
}

/**
 * GET /v1/gdpr/customer/:id/export — a portable JSON export of everything
 * held about a customer (data-portability). Company-scoped, secure-404.
 */
exports.exportCustomer = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const customer = await findScopedCustomer(req, res);
    if (!customer) return undefined;

    const custId = customer.custId;
    let bundle;
    try {
        const [invoices, jobs, expenses, timeEntries, payments, retainers, recurringInvoices] = await Promise.all([
            db.Invoice.findAll({ where: { invCustId: custId } }),
            db.Job.findAll({ where: { jobCustId: custId } }),
            db.Expense.findAll({ where: { expCustId: custId } }),
            db.TimeEntry.findAll({ where: { teCustId: custId } }),
            db.CustomerPayment.findAll({ where: { cpayCustId: custId } }),
            db.Retainer.findAll({ where: { retCustId: custId } }),
            db.RecurringInvoice.findAll({ where: { recinvCustId: custId } }),
        ]);
        bundle = { invoices, jobs, expenses, timeEntries, payments, retainers, recurringInvoices };
    } catch (error) {
        log.error({ err: error }, 'gdpr export: aggregation failed');
        return res.status(500).json({ message: "Error!" });
    }

    const counts = {};
    for (const [k, v] of Object.entries(bundle)) counts[k] = v.length;

    return res.status(200).json({
        message: "GDPR data export.",
        exportedAt: new Date().toISOString(),
        customer,
        ...bundle,
        counts,
    });
};

/**
 * POST /v1/gdpr/customer/:id/erase — right-to-erasure: scrub the
 * customer's personal data (financial records are retained) and archive
 * the row. Company-scoped, secure-404.
 */
exports.eraseCustomer = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const customer = await findScopedCustomer(req, res);
    if (!customer) return undefined;

    try {
        await customer.update({ ...anonymizedValues(), custArch: true });
        return res.status(200).json({ message: "Customer personal data erased.", custId: customer.custId });
    } catch (error) {
        log.error({ err: error }, 'gdpr erase: Customer.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};
