// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreateIndirect } = require('./_bulk-helpers.js');
const ProductEntry = db.ProductEntry;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByJobId = auth.getCompanyIdByJobId;

const ALLOWED_FIELDS_CREATE = ['pentQty', 'pentJobId', 'pentInvtId', 'pentTaxable'];
const ALLOWED_FIELDS_UPDATE = ['pentQty', 'pentInvtId', 'pentTaxable'];

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
    if (!payload.pentJobId) {
        return res.status(400).json({ message: "pentJobId is required." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByJobId(payload.pentJobId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(403).json({
                message: "Cannot create a product entry for a job in a company you do not belong to.",
            });
        }
    }

    payload.penArch = false;

    try {
        const created = await ProductEntry.create(payload);
        return res.status(201).json({ message: "Product entry created.", productEntry: created });
    } catch (error) {
        log.error({ err: error }, 'ProductEntry.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let productEntry;
    try {
        productEntry = await ProductEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'ProductEntry.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!productEntry || productEntry.penArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByJobId(productEntry.pentJobId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", productEntry });
};

exports.listByJob = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetJobId = Number(req.params.id);
    if (!Number.isInteger(targetJobId) || targetJobId <= 0) {
        return res.status(400).json({ message: "Invalid job id." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByJobId(targetJobId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
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
        const { count, rows } = await ProductEntry.findAndCountAll({
            where: { pentJobId: targetJobId },
            limit, offset,
            order: [['pentId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved product entries for JobId " + targetJobId,
            count, limit, offset, productEntries: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'ProductEntry.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let productEntry;
    try {
        productEntry = await ProductEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'ProductEntry.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!productEntry || productEntry.penArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByJobId(productEntry.pentJobId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
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
        await productEntry.update(updates);
        return res.status(200).json({ message: "Updated.", productEntry });
    } catch (error) {
        log.error({ err: error }, 'ProductEntry.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let productEntry;
    try {
        productEntry = await ProductEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'ProductEntry.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!productEntry || productEntry.penArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByJobId(productEntry.pentJobId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await productEntry.update({ penArch: true });
        return res.status(200).json({ message: "Archived.", id: productEntry.pentId });
    } catch (error) {
        log.error({ err: error }, 'ProductEntry archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.bulkCreate = makeBulkCreateIndirect({
    Model: ProductEntry,
    modelKey: 'ProductEntry',
    parentFkField: 'pentJobId',
    resolveParentCompanyId: auth.getCompanyIdByJobId,
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'penArch',
    bodyKey: 'productEntries',
    createdKey: 'productEntries',
});

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByJobId };
