// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const BillingType = db.BillingType;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = ['btName', 'btHourlyRate', 'btCompId'];
const ALLOWED_FIELDS_UPDATE = ['btName', 'btHourlyRate'];

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
        if (payload.btCompId !== undefined && Number(payload.btCompId) !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot create a billing type for a company you do not belong to.",
            });
        }
        payload.btCompId = authKeyCompanyId;
    } else {
        if (payload.btCompId === undefined || Number(payload.btCompId) <= 0) {
            return res.status(400).json({
                message: "Master-key requests must specify btCompId.",
            });
        }
    }

    payload.btArch = false;

    try {
        const created = await BillingType.create(payload);
        return res.status(201).json({ message: "Billing type created.", billingType: created });
    } catch (error) {
        log.error({ err: error }, 'BillingType.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let billingType;
    try {
        billingType = await BillingType.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'BillingType.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!billingType || billingType.btArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || billingType.btCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", billingType });
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
        const { count, rows } = await BillingType.findAndCountAll({
            where: { btCompId: targetCompanyId, btArch: false },
            limit,
            offset,
            order: [['btId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        res.setHeader('Access-Control-Expose-Headers', 'Link');
        return res.status(200).json({
            message: "Successfully retrieved billing types with CompanyId " + targetCompanyId,
            count,
            limit,
            offset,
            billingTypes: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'BillingType.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let billingType;
    try {
        billingType = await BillingType.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'BillingType.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!billingType || billingType.btArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || billingType.btCompId !== companyId) {
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
        await billingType.update(updates);
        return res.status(200).json({ message: "Updated.", billingType });
    } catch (error) {
        log.error({ err: error }, 'BillingType.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let billingType;
    try {
        billingType = await BillingType.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'BillingType.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!billingType || billingType.btArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || billingType.btCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await billingType.update({ btArch: true });
        return res.status(200).json({ message: "Archived.", id: billingType.btId });
    } catch (error) {
        log.error({ err: error }, 'BillingType archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster, GetCompanyId };
