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
const PurchaseOrderLine = db.PurchaseOrderLine;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByPohId = auth.getCompanyIdByPohId;

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

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const headerCompanyId = await GetCompanyIdByPohId(payload.polpoh);
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
            return res.status(403).json({
                message: "Cannot create a PO line for a header in a company you do not belong to.",
            });
        }
    }

    payload.polArch = false;

    try {
        const created = await PurchaseOrderLine.create(payload);
        return res.status(201).json({ message: "Purchase order line created.", purchaseOrderLine: created });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!line || line.polArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const headerCompanyId = await GetCompanyIdByPohId(line.polpoh);
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
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

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
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
            where: { polpoh: targetHeaderId, polArch: false },
            limit, offset,
            order: [['polId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        res.setHeader('Access-Control-Expose-Headers', 'Link');
        return res.status(200).json({
            message: "Successfully retrieved PO lines for HeaderId " + targetHeaderId,
            count, limit, offset, purchaseOrderLines: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!line || line.polArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const headerCompanyId = await GetCompanyIdByPohId(line.polpoh);
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
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
        await line.update(updates);
        return res.status(200).json({ message: "Updated.", purchaseOrderLine: line });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
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
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!line || line.polArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const headerCompanyId = await GetCompanyIdByPohId(line.polpoh);
        if (authCompanyId === -1 || headerCompanyId === -1 || authCompanyId !== headerCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await line.update({ polArch: true });
        return res.status(200).json({ message: "Archived.", id: line.polId });
    } catch (error) {
        log.error({ err: error }, 'PurchaseOrderLine archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByPohId };
