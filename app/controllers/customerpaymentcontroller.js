// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreateIndirect } = require('./_bulk-helpers.js');
const CustomerPayment = db.CustomerPayment;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
// #374: prefer attachAuth's resolved context in the handlers below; the
// raw IsMaster / GetCompanyId above are retained only for the _internals
// test seam.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;

const ALLOWED_FIELDS_CREATE = ['cpayCustId', 'cpayInvId', 'cpayDescription', 'cpayDate', 'cpayAmount'];
const ALLOWED_FIELDS_UPDATE = ['cpayInvId', 'cpayDescription', 'cpayDate', 'cpayAmount'];

/**
 * When a payment is allocated (cpayInvId set, non-null), the invoice
 * must belong to the same customer as the payment (cpayCustId) — a
 * payment can't be booked against another customer's invoice. Archived
 * invoices are hidden by defaultScope and therefore read as "not found"
 * → 400. `null` (update-only, to de-allocate) is skipped. Returns null
 * when legal, or a { status, message } object the caller sends as-is.
 */
async function checkInvoiceAllocation(cpayInvId, custId) {
    if (cpayInvId === undefined || cpayInvId === null) return null;
    const invoice = await db.Invoice.findByPk(Number(cpayInvId), {
        attributes: ['invCustId'],
    });
    if (!invoice || invoice.invCustId !== Number(custId)) {
        return {
            status: 400,
            message: 'cpayInvId must reference an invoice for the same customer (cpayCustId).',
        };
    }
    return null;
}

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
    if (!payload.cpayCustId) {
        return res.status(400).json({ message: "cpayCustId is required." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        if (authCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const custCompanyId = await GetCompanyIdByCustomerId(payload.cpayCustId);
        if (custCompanyId === -1 || custCompanyId !== authCompanyId) {
            return res.status(403).json({
                message: "Cannot create a payment for a customer in a company you do not belong to.",
            });
        }
    }

    payload.cpayArch = false;

    let allocError;
    try {
        allocError = await checkInvoiceAllocation(payload.cpayInvId, payload.cpayCustId);
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment invoice-allocation validation failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (allocError) {
        return res.status(allocError.status).json({ message: allocError.message });
    }

    try {
        const created = await CustomerPayment.create(payload);
        return res.status(201).json({ message: "Customer payment created.", customerPayment: created });
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let payment;
    try {
        payment = await CustomerPayment.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!payment || payment.cpayArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const cpCompanyId = await GetCompanyIdByCustomerId(payment.cpayCustId);
        // Cross-tenant access is reported as 404, not 403 — otherwise
        // a scoped caller can enumerate which CustomerPayment ids are
        // populated across the whole tenant table by status code.
        // Same secure-404 pattern as the prior 10 entities (#174 /
        // #188 / #192 / #196 / #200 / #204 / #210 / #214 / #218 /
        // #222).
        if (authCompanyId === -1 || cpCompanyId === -1 || authCompanyId !== cpCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", customerPayment: payment });
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

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
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
        const { count, rows } = await CustomerPayment.findAndCountAll({
            where: { cpayCustId: targetCustomerId },
            limit, offset,
            order: [['cpayDate', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved customer payments for CustomerId " + targetCustomerId,
            count, limit, offset, customerPayments: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let payment;
    try {
        payment = await CustomerPayment.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!payment || payment.cpayArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const cpCompanyId = await GetCompanyIdByCustomerId(payment.cpayCustId);
        // Secure-404 on PATCH for the same reason as GET.
        if (authCompanyId === -1 || cpCompanyId === -1 || authCompanyId !== cpCompanyId) {
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

    let allocError;
    try {
        allocError = await checkInvoiceAllocation(updates.cpayInvId, payment.cpayCustId);
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment invoice-allocation validation failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (allocError) {
        return res.status(allocError.status).json({ message: allocError.message });
    }

    try {
        await payment.update(updates);
        return res.status(200).json({ message: "Updated.", customerPayment: payment });
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let payment;
    try {
        payment = await CustomerPayment.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!payment || payment.cpayArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const cpCompanyId = await GetCompanyIdByCustomerId(payment.cpayCustId);
        // Secure-404 on DELETE for the same reason as GET / PATCH.
        if (authCompanyId === -1 || cpCompanyId === -1 || authCompanyId !== cpCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await payment.update({ cpayArch: true });
        return res.status(200).json({ message: "Archived.", id: payment.cpayId });
    } catch (error) {
        log.error({ err: error }, 'CustomerPayment archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.bulkCreate = makeBulkCreateIndirect({
    Model: CustomerPayment,
    modelKey: 'CustomerPayment',
    parentFkField: 'cpayCustId',
    resolveParentCompanyId: auth.getCompanyIdByCustomerId,
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'cpayArch',
    bodyKey: 'customerPayments',
    createdKey: 'customerPayments',
});

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByCustomerId };
