// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { anonymizedValues, streamRelationArray } = require('../services/gdpr.js');

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
 *
 * The related sets are STREAMED in keyset-paginated batches rather than
 * loaded whole (audit item #3): a customer with a very large history would
 * otherwise blow the heap on the parallel un-`limit`ed `findAll`s. The
 * response is the same single JSON object; it is just assembled incrementally
 * so peak memory stays O(batch), not O(total rows).
 */
exports.exportCustomer = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const customer = await findScopedCustomer(req, res);
    if (!customer) return undefined;

    const custId = customer.custId;
    const Op = db.Sequelize.Op;
    // Same set + order as before; each entry streams as its own JSON array.
    const RELATIONS = [
        { key: 'invoices', model: db.Invoice, fk: 'invCustId' },
        { key: 'jobs', model: db.Job, fk: 'jobCustId' },
        { key: 'expenses', model: db.Expense, fk: 'expCustId' },
        { key: 'timeEntries', model: db.TimeEntry, fk: 'teCustId' },
        { key: 'payments', model: db.CustomerPayment, fk: 'cpayCustId' },
        { key: 'retainers', model: db.Retainer, fk: 'retCustId' },
        { key: 'recurringInvoices', model: db.RecurringInvoice, fk: 'recinvCustId' },
    ];

    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
        res.write('{"message":"GDPR data export."'
            + ',"exportedAt":' + JSON.stringify(new Date().toISOString())
            + ',"customer":' + JSON.stringify(customer)
            + ',');
        const counts = {};
        for (const rel of RELATIONS) {
            res.write(JSON.stringify(rel.key) + ':[');
            counts[rel.key] = await streamRelationArray(
                rel.model, { [rel.fk]: custId }, Op, (chunk) => res.write(chunk),
            );
            res.write('],');
        }
        res.write('"counts":' + JSON.stringify(counts) + '}');
        return res.end();
    } catch (error) {
        log.error({ err: error }, 'gdpr export: streaming failed');
        // If nothing was flushed yet we can still send a clean 500; once the
        // stream has started the client detects the truncated JSON.
        if (!res.headersSent) return res.status(500).json({ message: "Error!" });
        return res.end();
    }
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
