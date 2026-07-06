// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Company controller.
 *
 * Company is special: compId IS the company id (no compCompId column).
 * Auth shape differs from Customer/Worker:
 *   - POST    /v1/company        — master only
 *   - GET     /v1/company        — master only (list all)
 *   - GET     /v1/company/:id    — master: any; non-master: only own
 *   - PATCH   /v1/company/:id    — master: any; non-master: only own
 *   - DELETE  /v1/company/:id    — master only (soft-delete)
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const Company = db.Company;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = [
    'compName', 'compAddress1', 'compAddress2', 'compCity',
    'compState', 'compZip', 'compPhone', 'compEmail',
    'compInvPrefix', 'compInvPad', 'compInvNextSeq', 'compTaxRate', 'compInvFooter', 'compCurrency', 'compTimeLockDate',
];
const ALLOWED_FIELDS_UPDATE = ALLOWED_FIELDS_CREATE;

exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        return res.status(403).json({ message: "Only master keys may create companies." });
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    payload.compArch = false;

    try {
        const created = await Company.create(payload);
        return res.status(201).json({ message: "Company created.", company: created });
    } catch (error) {
        log.error({ err: error }, 'Company.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let company;
    try {
        company = await Company.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Company.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!company || company.compArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        // Cross-tenant access (caller's company doesn't match the
        // looked-up company) is reported as 404, not 403. Returning
        // 403 here would let a non-master caller enumerate which
        // companies exist by probing IDs: 403 = "this company exists
        // but isn't yours", 404 = "doesn't exist at all". Collapse
        // both into 404 so the API doesn't leak the size of the
        // tenant table to scoped keys.
        if (companyId === -1 || company.compId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", company });
};

exports.list = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        return res.status(403).json({ message: "Only master keys may list all companies." });
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
        const { count, rows } = await Company.findAndCountAll({
            limit,
            offset,
            order: [['compId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved companies",
            count,
            limit,
            offset,
            companies: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Company.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let company;
    try {
        company = await Company.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Company.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!company || company.compArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        // Same secure-404 pattern as getById: don't let a non-master
        // caller distinguish "this company exists but isn't yours"
        // from "this id doesn't exist" by status code.
        if (companyId === -1 || company.compId !== companyId) {
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

    try {
        await company.update(updates);
        return res.status(200).json({ message: "Updated.", company });
    } catch (error) {
        log.error({ err: error }, 'Company.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        return res.status(403).json({ message: "Only master keys may archive companies." });
    }

    let company;
    try {
        company = await Company.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Company.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!company || company.compArch) {
        return res.status(404).json({ message: "Not found." });
    }

    try {
        await company.update({ compArch: true });
        return res.status(200).json({ message: "Archived.", id: company.compId });
    } catch (error) {
        log.error({ err: error }, 'Company archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports._internals = { IsMaster, GetCompanyId };
