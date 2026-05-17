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
const PurchaseOrderVendor = db.PurchaseOrderVendor;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

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
        isAuthKeyMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }

    if (!isAuthKeyMasterKey) {
        let authKeyCompanyId;
        try {
            authKeyCompanyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!", error: String(error) });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!vendor || vendor.povArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || vendor.povCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
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

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
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
            where: { povCompId: targetCompanyId, povArch: false },
            limit, offset,
            order: [['povId', 'ASC']],
        });
        return res.status(200).json({
            message: "Successfully retrieved PO vendors with CompanyId " + targetCompanyId,
            count, limit, offset, purchaseOrderVendors: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!vendor || vendor.povArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || vendor.povCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!vendor || vendor.povArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || vendor.povCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await vendor.update({ povArch: true });
        return res.status(200).json({ message: "Archived.", id: vendor.povId });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderVendor archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster, GetCompanyId };
