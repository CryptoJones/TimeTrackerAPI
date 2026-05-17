// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const Invoice = db.Invoice;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;

const ALLOWED_FIELDS_CREATE = ['invCustId', 'invDate', 'invDueDate', 'invPaid'];
const ALLOWED_FIELDS_UPDATE = ['invDate', 'invDueDate', 'invPaid'];

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
    if (!payload.invCustId) {
        return res.status(400).json({ message: "invCustId is required." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        if (authCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const custCompanyId = await GetCompanyIdByCustomerId(payload.invCustId);
        if (custCompanyId === -1 || custCompanyId !== authCompanyId) {
            return res.status(403).json({
                message: "Cannot create an invoice for a customer in a company you do not belong to.",
            });
        }
    }

    if (payload.invPaid === undefined) payload.invPaid = false;
    payload.invArch = false;

    try {
        const created = await Invoice.create(payload);
        return res.status(201).json({ message: "Invoice created.", invoice: created });
    } catch (error) {
        log.error({ err: error }, 'Invoice.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", invoice });
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

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
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
        const { count, rows } = await Invoice.findAndCountAll({
            where: { invCustId: targetCustomerId, invArch: false },
            limit, offset,
            order: [['invId', 'ASC']],
        });
        return res.status(200).json({
            message: "Successfully retrieved invoices for CustomerId " + targetCustomerId,
            count, limit, offset, invoices: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Invoice.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
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
        await invoice.update(updates);
        return res.status(200).json({ message: "Updated.", invoice });
    } catch (error) {
        log.error({ err: error }, 'Invoice.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoice;
    try {
        invoice = await Invoice.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        if (authCompanyId === -1 || invCompanyId === -1 || authCompanyId !== invCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await invoice.update({ invArch: true });
        return res.status(200).json({ message: "Archived.", id: invoice.invId });
    } catch (error) {
        log.error({ err: error }, 'Invoice archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByCustomerId };
