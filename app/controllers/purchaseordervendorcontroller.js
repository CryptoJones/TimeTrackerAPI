// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * PurchaseOrderVendor controller — direct compId scoping via povCompId.
 * Same auth shape as Worker/BillingType/InventoryItem.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreate } = require('./_bulk-helpers.js');
const PurchaseOrderVendor = db.PurchaseOrderVendor;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
// #374: prefer attachAuth's resolved context in the handlers below; the
// raw IsMaster / GetCompanyId above are retained only for the _internals
// test seam.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

// The schema whitelist already validates fields; we re-state it here so
// the controller doesn't trust the request body verbatim (mass-assignment
// defense — a forged povId in the body wouldn't make it through this
// allowlist even if the schema were bypassed).
const ALLOWED_FIELDS_CREATE = [
    'povName', 'povMailingAddress1', 'povMailingAddress2', 'povMailingCity',
    'povMailingState', 'povMailingCountry', 'povMailingZip',
    'povBillingAddress1', 'povBillingAddress2', 'povBillingCity',
    'povBillingState', 'povBillingCountry', 'povBillingZip',
    'povPhone', 'povEMail', 'povCompId',
];
const ALLOWED_FIELDS_UPDATE = ALLOWED_FIELDS_CREATE.filter(f => f !== 'povCompId');

exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isAuthKeyMasterKey;
    try {
        isAuthKeyMasterKey = await MasterFromReq(req, authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }

    if (!isAuthKeyMasterKey) {
        let authKeyCompanyId;
        try {
            authKeyCompanyId = await CompanyIdFromReq(req, authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (authKeyCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (payload.povCompId !== undefined && Number(payload.povCompId) !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot create a PO vendor for a company you do not belong to.",
            });
        }
        payload.povCompId = authKeyCompanyId;
    } else {
        if (payload.povCompId === undefined || Number(payload.povCompId) <= 0) {
            return res.status(400).json({
                message: "Master-key requests must specify povCompId.",
            });
        }
    }

    payload.povArch = false;

    try {
        const created = await PurchaseOrderVendor.create(payload);
        return res.status(201).json({ message: "PO vendor created.", purchaseOrderVendor: created });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let vendor;
    try {
        vendor = await PurchaseOrderVendor.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!vendor || vendor.povArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        // Cross-tenant access is reported as 404, not 403 — otherwise
        // a scoped caller can enumerate which PurchaseOrderVendor ids
        // are populated across the whole tenant table by status code.
        // Same secure-404 pattern as #174 (company), #188 (billingtype),
        // #192 (worker), #196 (inventoryitem).
        if (companyId === -1 || vendor.povCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", purchaseOrderVendor: vendor });
};

exports.listByCompany = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetCompanyId = Number(req.params.id);
    if (!Number.isInteger(targetCompanyId) || targetCompanyId <= 0) {
        return res.status(400).json({ message: "Invalid company id." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== targetCompanyId) {
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
        const { count, rows } = await PurchaseOrderVendor.findAndCountAll({
            where: { povCompId: targetCompanyId },
            limit, offset,
            order: [['povId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved PO vendors with CompanyId " + targetCompanyId,
            count, limit, offset, purchaseOrderVendors: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let vendor;
    try {
        vendor = await PurchaseOrderVendor.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!vendor || vendor.povArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        // Secure-404 on PATCH for the same reason as GET.
        if (companyId === -1 || vendor.povCompId !== companyId) {
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
        await vendor.update(updates);
        return res.status(200).json({ message: "Updated.", purchaseOrderVendor: vendor });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let vendor;
    try {
        vendor = await PurchaseOrderVendor.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!vendor || vendor.povArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        // Secure-404 on DELETE for the same reason as GET / PATCH.
        if (companyId === -1 || vendor.povCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await vendor.update({ povArch: true });
        return res.status(200).json({ message: "Archived.", id: vendor.povId });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.bulkCreate = makeBulkCreate({
    Model: PurchaseOrderVendor,
    modelKey: 'PurchaseOrderVendor',
    compIdField: 'povCompId',
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'povArch',
    bodyKey: 'vendors',
    createdKey: 'vendors',
});

exports._internals = { IsMaster, GetCompanyId };
