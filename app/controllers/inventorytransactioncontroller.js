// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * InventoryTransaction controller — direct compId scoping via
 * invtCompanyId. Note that PATCH/DELETE on a movement log is unusual
 * (production accounting systems prefer reversing entries); we expose
 * them for surface parity, but operators may want to disable them at
 * the reverse-proxy layer for audit-grade deployments.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const InventoryTransaction = db.InventoryTransaction;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = ['invtDirection', 'invtInitId', 'invtCompanyId'];
const ALLOWED_FIELDS_UPDATE = ['invtDirection', 'invtInitId'];

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
        const authKeyCompanyId = await GetCompanyId(authKey);
        if (authKeyCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (payload.invtCompanyId !== undefined && Number(payload.invtCompanyId) !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot create an inventory transaction for a company you do not belong to.",
            });
        }
        payload.invtCompanyId = authKeyCompanyId;
    } else {
        if (payload.invtCompanyId === undefined || Number(payload.invtCompanyId) <= 0) {
            return res.status(400).json({
                message: "Master-key requests must specify invtCompanyId.",
            });
        }
    }

    payload.invtArch = false;

    try {
        const created = await InventoryTransaction.create(payload);
        return res.status(201).json({ message: "Inventory transaction created.", inventoryTransaction: created });
    } catch (error) {
        log.error({ err: error }, 'InventoryTransaction.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let txn;
    try {
        txn = await InventoryTransaction.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InventoryTransaction.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!txn || txn.invtArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || txn.invtCompanyId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", inventoryTransaction: txn });
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
        ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset : 0;

    try {
        const { count, rows } = await InventoryTransaction.findAndCountAll({
            where: { invtCompanyId: targetCompanyId, invtArch: false },
            limit, offset,
            order: [['invtId', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        res.setHeader('Access-Control-Expose-Headers', 'Link');
        return res.status(200).json({
            message: "Successfully retrieved inventory transactions with CompanyId " + targetCompanyId,
            count, limit, offset, inventoryTransactions: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'InventoryTransaction.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let txn;
    try {
        txn = await InventoryTransaction.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InventoryTransaction.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!txn || txn.invtArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || txn.invtCompanyId !== companyId) {
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
        await txn.update(updates);
        return res.status(200).json({ message: "Updated.", inventoryTransaction: txn });
    } catch (error) {
        log.error({ err: error }, 'InventoryTransaction.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let txn;
    try {
        txn = await InventoryTransaction.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InventoryTransaction.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!txn || txn.invtArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || txn.invtCompanyId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await txn.update({ invtArch: true });
        return res.status(200).json({ message: "Archived.", id: txn.invtId });
    } catch (error) {
        log.error({ err: error }, 'InventoryTransaction archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster, GetCompanyId };
