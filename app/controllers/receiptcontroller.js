// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { CONTENT_TYPES } = require('../schemas/receipt.schema.js');
const Receipt = db.Receipt;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB decoded
// Metadata only — rcptData (the bytes) is deliberately excluded.
const SAFE_ATTRS = ['rcptId', 'rcptExpId', 'rcptCompId', 'rcptFilename', 'rcptContentType', 'rcptSize', 'rcptArch', 'createdAt', 'updatedAt'];

/** Resolve the caller's company id (or null after responding). Master → null (any). */
async function callerCompany(req, res) {
    const isMaster = await IsMaster(req.get('authKey'));
    if (isMaster) return { isMaster: true, companyId: null };
    const companyId = await GetCompanyId(req.get('authKey'));
    if (companyId === -1) {
        res.status(403).json({ message: "Invalid Authorization Key." });
        return null;
    }
    return { isMaster: false, companyId };
}

/** Load a receipt and enforce the secure-404 company scope. `withData` includes the bytes. */
async function findScoped(req, res, withData) {
    let receipt;
    try {
        receipt = await Receipt.findByPk(req.params.id, withData ? undefined : { attributes: SAFE_ATTRS });
    } catch (error) {
        log.error({ err: error }, 'Receipt.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!receipt || receipt.rcptArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const scope = await callerCompany(req, res);
    if (!scope) return null;
    if (!scope.isMaster && receipt.rcptCompId !== scope.companyId) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    return receipt;
}

/** POST /v1/receipt — attach a base64 file to an expense. */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const body = req.body || {};
    const expId = Number(body.expId);
    if (!Number.isInteger(expId) || expId <= 0) {
        return res.status(400).json({ message: "expId is required and must be an integer." });
    }

    let expense;
    try {
        expense = await db.Expense.findByPk(expId, { attributes: ['expId', 'expCompId'] });
    } catch (error) {
        log.error({ err: error }, 'receipt create: Expense.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!expense || expense.expCompId == null) {
        return res.status(400).json({ message: "expId must reference an expense." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || companyId !== expense.expCompId) {
            return res.status(403).json({ message: "Cannot attach a receipt to an expense in a company you do not belong to." });
        }
    }

    if (!CONTENT_TYPES.includes(body.contentType)) {
        return res.status(400).json({ message: "Unsupported contentType." });
    }

    // The schema already enforces base64 shape; Buffer.from is lenient.
    const data = Buffer.from(String(body.dataBase64), 'base64');
    if (data.length === 0) {
        return res.status(400).json({ message: "Receipt file is empty." });
    }
    if (data.length > MAX_BYTES) {
        return res.status(400).json({ message: "Receipt exceeds the maximum size (5 MB)." });
    }

    try {
        const created = await Receipt.create({
            rcptExpId: expId,
            rcptCompId: expense.expCompId,
            rcptFilename: body.filename,
            rcptContentType: body.contentType,
            rcptSize: data.length,
            rcptData: data,
            rcptArch: false,
        });
        return res.status(201).json({
            message: "Receipt attached.",
            receipt: {
                rcptId: created.rcptId, rcptExpId: expId, rcptCompId: expense.expCompId,
                rcptFilename: created.rcptFilename, rcptContentType: created.rcptContentType, rcptSize: created.rcptSize,
            },
        });
    } catch (error) {
        log.error({ err: error }, 'Receipt.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/receipt/:id — fetch receipt metadata (not the bytes). Secure-404. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const receipt = await findScoped(req, res, false);
    if (!receipt) return undefined;
    return res.status(200).json({ message: "Found.", receipt });
};

/** GET /v1/receipt/:id/download — stream the receipt file. Secure-404. */
exports.download = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const receipt = await findScoped(req, res, true);
    if (!receipt) return undefined;
    const safeName = String(receipt.rcptFilename || 'receipt').replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', receipt.rcptContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    return res.status(200).send(receipt.rcptData);
};

/** GET /v1/receipt/byexpense/:id — list an expense's receipts (metadata). */
exports.listByExpense = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const expId = Number(req.params.id);
    if (!Number.isInteger(expId) || expId <= 0) {
        return res.status(400).json({ message: "Invalid expense id." });
    }

    let expense;
    try {
        expense = await db.Expense.findByPk(expId, { attributes: ['expId', 'expCompId'] });
    } catch (error) {
        log.error({ err: error }, 'receipt listByExpense: Expense.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!expense) {
        return res.status(404).json({ message: "Not found." });
    }
    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || companyId !== expense.expCompId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await Receipt.findAndCountAll({
            where: { rcptExpId: expId },
            attributes: SAFE_ATTRS,
            limit,
            offset,
            order: [['rcptId', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, receipts: rows });
    } catch (error) {
        log.error({ err: error }, 'Receipt.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/receipt/:id — soft-delete (sets rcptArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const receipt = await findScoped(req, res, false);
    if (!receipt) return undefined;

    try {
        await receipt.update({ rcptArch: true });
        return res.status(200).json({ message: "Archived.", id: receipt.rcptId });
    } catch (error) {
        log.error({ err: error }, 'Receipt archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
