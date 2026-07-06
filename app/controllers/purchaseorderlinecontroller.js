// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * PurchaseOrderLine controller — header-scoped auth via
 * polpoh → PurchaseOrderHeader → vendor.povCompId.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreateIndirect } = require('./_bulk-helpers.js');
const PurchaseOrderLine = db.PurchaseOrderLine;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByPohId = auth.getCompanyIdByPohId;
// #374: prefer attachAuth's resolved context in the handlers below; the
// raw IsMaster / GetCompanyId above are retained only for the _internals
// test seam.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

const ALLOWED_FIELDS_CREATE = ['polpoh', 'polItemDesc', 'polQty', 'polPrice', 'polInvtId'];
const ALLOWED_FIELDS_UPDATE = ['polItemDesc', 'polQty', 'polPrice', 'polInvtId'];

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
    if (!payload.polpoh) {
        return res.status(400).json({ message: "polpoh (PO header id) is required." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const headerCompanyId = await GetCompanyIdByPohId(payload.polpoh);
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
            return res.status(403).json({
                message: "Cannot create a PO line for a header in a company you do not belong to.",
            });
        }
        // The secondary inventory-item FK must also belong to the caller's
        // company — the parent header is scoped above, but polInvtId was
        // previously unchecked (cross-tenant / dangling reference).
        if (!(await auth.inventoryFkBelongsTo(payload.polInvtId, authCompanyId))) {
            return res.status(400).json({ message: "Invalid inventory item." });
        }
    }

    payload.polArch = false;

    try {
        const created = await PurchaseOrderLine.create(payload);
        return res.status(201).json({ message: "Purchase order line created.", purchaseOrderLine: created });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let line;
    try {
        line = await PurchaseOrderLine.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!line || line.polArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const headerCompanyId = await GetCompanyIdByPohId(line.polpoh);
        // Cross-tenant access is reported as 404, not 403 — otherwise
        // a scoped caller can enumerate which PurchaseOrderLine ids
        // are populated across the whole tenant table by status code.
        // Same secure-404 pattern as the prior 7 entities (#174 / #188
        // / #192 / #196 / #200 / #204 / #210).
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", purchaseOrderLine: line });
};

exports.listByHeader = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetHeaderId = Number(req.params.id);
    if (!Number.isInteger(targetHeaderId) || targetHeaderId <= 0) {
        return res.status(400).json({ message: "Invalid header id." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const headerCompanyId = await GetCompanyIdByPohId(targetHeaderId);
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
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
        const { count, rows } = await PurchaseOrderLine.findAndCountAll({
            where: { polpoh: targetHeaderId },
            limit, offset,
            order: [['polId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved PO lines for HeaderId " + targetHeaderId,
            count, limit, offset, purchaseOrderLines: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let line;
    try {
        line = await PurchaseOrderLine.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!line || line.polArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const headerCompanyId = await GetCompanyIdByPohId(line.polpoh);
        // Secure-404 on PATCH for the same reason as GET.
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
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
    // A changed inventory-item FK must belong to the caller's company.
    if (!isMaster && updates.polInvtId !== undefined) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        if (!(await auth.inventoryFkBelongsTo(updates.polInvtId, authCompanyId))) {
            return res.status(400).json({ message: "Invalid inventory item." });
        }
    }

    try {
        await line.update(updates);
        return res.status(200).json({ message: "Updated.", purchaseOrderLine: line });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let line;
    try {
        line = await PurchaseOrderLine.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!line || line.polArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const headerCompanyId = await GetCompanyIdByPohId(line.polpoh);
        // Secure-404 on DELETE for the same reason as GET / PATCH.
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await line.update({ polArch: true });
        return res.status(200).json({ message: "Archived.", id: line.polId });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.bulkCreate = makeBulkCreateIndirect({
    Model: PurchaseOrderLine,
    modelKey: 'PurchaseOrderLine',
    parentFkField: 'polpoh',
    resolveParentCompanyId: auth.getCompanyIdByPohId,
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'polArch',
    bodyKey: 'purchaseOrderLines',
    createdKey: 'purchaseOrderLines',
    secondaryFk: { field: 'polInvtId', belongsTo: auth.inventoryFkBelongsTo },
});

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByPohId };
