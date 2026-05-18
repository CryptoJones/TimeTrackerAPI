// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * PurchaseOrderHeader controller — vendor-scoped auth via
 * pohPovId → PurchaseOrderVendor.povCompId.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreateIndirect } = require('./_bulk-helpers.js');
const PurchaseOrderHeader = db.PurchaseOrderHeader;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByPovId = auth.getCompanyIdByPovId;

const ALLOWED_FIELDS_CREATE = ['pohDate', 'pohReference', 'pohTerms', 'pohPovId'];
const ALLOWED_FIELDS_UPDATE = ['pohDate', 'pohReference', 'pohTerms'];

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
    if (!payload.pohPovId) {
        return res.status(400).json({ message: "pohPovId is required." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const vendorCompanyId = await GetCompanyIdByPovId(payload.pohPovId);
        if (authCompanyId === -1 || vendorCompanyId === -1 || authCompanyId !== vendorCompanyId) {
            return res.status(403).json({
                message: "Cannot create a purchase order for a vendor in a company you do not belong to.",
            });
        }
    }

    payload.pohArch = false;

    try {
        const created = await PurchaseOrderHeader.create(payload);
        return res.status(201).json({ message: "Purchase order header created.", purchaseOrderHeader: created });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderHeader.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let header;
    try {
        header = await PurchaseOrderHeader.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderHeader.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!header || header.pohArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const vendorCompanyId = await GetCompanyIdByPovId(header.pohPovId);
        if (authCompanyId === -1 || vendorCompanyId === -1 || authCompanyId !== vendorCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", purchaseOrderHeader: header });
};

exports.listByVendor = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetVendorId = Number(req.params.id);
    if (!Number.isInteger(targetVendorId) || targetVendorId <= 0) {
        return res.status(400).json({ message: "Invalid vendor id." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const vendorCompanyId = await GetCompanyIdByPovId(targetVendorId);
        if (authCompanyId === -1 || vendorCompanyId === -1 || authCompanyId !== vendorCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset : 0;

    try {
        const { count, rows } = await PurchaseOrderHeader.findAndCountAll({
            where: { pohPovId: targetVendorId },
            limit, offset,
            order: [['pohDate', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved purchase orders for VendorId " + targetVendorId,
            count, limit, offset, purchaseOrderHeaders: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderHeader.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let header;
    try {
        header = await PurchaseOrderHeader.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderHeader.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!header || header.pohArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const vendorCompanyId = await GetCompanyIdByPovId(header.pohPovId);
        if (authCompanyId === -1 || vendorCompanyId === -1 || authCompanyId !== vendorCompanyId) {
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
        await header.update(updates);
        return res.status(200).json({ message: "Updated.", purchaseOrderHeader: header });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderHeader.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let header;
    try {
        header = await PurchaseOrderHeader.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderHeader.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!header || header.pohArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const vendorCompanyId = await GetCompanyIdByPovId(header.pohPovId);
        if (authCompanyId === -1 || vendorCompanyId === -1 || authCompanyId !== vendorCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await header.update({ pohArch: true });
        return res.status(200).json({ message: "Archived.", id: header.pohId });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderHeader archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.bulkCreate = makeBulkCreateIndirect({
    Model: PurchaseOrderHeader,
    modelKey: 'PurchaseOrderHeader',
    parentFkField: 'pohPovId',
    resolveParentCompanyId: auth.getCompanyIdByPovId,
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'pohArch',
    bodyKey: 'purchaseOrderHeaders',
    createdKey: 'purchaseOrderHeaders',
});

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByPovId };
