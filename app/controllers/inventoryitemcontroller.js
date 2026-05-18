// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreate } = require('./_bulk-helpers.js');
const InventoryItem = db.InventoryItem;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = ['invitDescription', 'invitQty', 'invitCompId'];
const ALLOWED_FIELDS_UPDATE = ['invitDescription', 'invitQty'];

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
        if (payload.invitCompId !== undefined && Number(payload.invitCompId) !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot create an inventory item for a company you do not belong to.",
            });
        }
        payload.invitCompId = authKeyCompanyId;
    } else {
        if (payload.invitCompId === undefined || Number(payload.invitCompId) <= 0) {
            return res.status(400).json({
                message: "Master-key requests must specify invitCompId.",
            });
        }
    }

    payload.invitArch = false;

    try {
        const created = await InventoryItem.create(payload);
        return res.status(201).json({ message: "Inventory item created.", inventoryItem: created });
    } catch (error) {
        log.error({ err: error }, 'InventoryItem.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let inventoryItem;
    try {
        inventoryItem = await InventoryItem.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InventoryItem.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!inventoryItem || inventoryItem.invitArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || inventoryItem.invitCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", inventoryItem });
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
        const { count, rows } = await InventoryItem.findAndCountAll({
            where: { invitCompId: targetCompanyId, invitArch: false },
            limit,
            offset,
            order: [['invitId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        res.setHeader('Access-Control-Expose-Headers', 'Link');
        return res.status(200).json({
            message: "Successfully retrieved inventory items with CompanyId " + targetCompanyId,
            count,
            limit,
            offset,
            inventoryItems: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'InventoryItem.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let inventoryItem;
    try {
        inventoryItem = await InventoryItem.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InventoryItem.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!inventoryItem || inventoryItem.invitArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || inventoryItem.invitCompId !== companyId) {
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
        await inventoryItem.update(updates);
        return res.status(200).json({ message: "Updated.", inventoryItem });
    } catch (error) {
        log.error({ err: error }, 'InventoryItem.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let inventoryItem;
    try {
        inventoryItem = await InventoryItem.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InventoryItem.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!inventoryItem || inventoryItem.invitArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || inventoryItem.invitCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await inventoryItem.update({ invitArch: true });
        return res.status(200).json({ message: "Archived.", id: inventoryItem.invitId });
    } catch (error) {
        log.error({ err: error }, 'InventoryItem archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.bulkCreate = makeBulkCreate({
    Model: InventoryItem,
    modelKey: 'InventoryItem',
    compIdField: 'invitCompId',
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'invitArch',
    bodyKey: 'inventoryItems',
    createdKey: 'inventoryItems',
});

exports._internals = { IsMaster, GetCompanyId };
