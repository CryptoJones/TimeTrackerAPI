// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const money = require('../services/money.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const Retainer = db.Retainer;

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;

/**
 * Load a retainer and enforce the secure-404 scope (through its
 * customer's company). Returns the retainer or null (after responding).
 */
async function findScoped(req, res) {
    let ret;
    try {
        ret = await Retainer.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Retainer.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!ret || ret.retArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await MasterFromReq(req, req.get('authKey'));
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, req.get('authKey'));
        let retCompanyId;
        try {
            retCompanyId = await GetCompanyIdByCustomerId(ret.retCustId);
        } catch (error) {
            log.error({ err: error }, 'retainer scope: company resolve failed');
            res.status(500).json({ message: "Error!" });
            return null;
        }
        if (companyId === -1 || retCompanyId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return ret;
}

/**
 * POST /v1/retainer — open a retainer for a customer. Starts fully
 * funded (retBalance = retAmount). The customer's company must be the
 * caller's (master keys may target any).
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const body = req.body || {};
    const retCustId = Number(body.retCustId);
    if (!Number.isInteger(retCustId) || retCustId <= 0) {
        return res.status(400).json({ message: "retCustId is required and must be an integer." });
    }

    let custCompanyId;
    try {
        custCompanyId = await GetCompanyIdByCustomerId(retCustId);
    } catch (error) {
        log.error({ err: error }, 'retainer create: company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (custCompanyId === -1) {
        return res.status(400).json({ message: "retCustId must reference a customer." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== custCompanyId) {
            return res.status(403).json({ message: "Cannot open a retainer for a customer in a company you do not belong to." });
        }
    }

    const amount = money.round(Number(body.retAmount));
    const payload = {
        retCustId,
        retAmount: amount,
        retBalance: amount,
        retNote: body.retNote,
        retArch: false,
    };
    try {
        const created = await Retainer.create(payload);
        return res.status(201).json({ message: "Retainer created.", retainer: created });
    } catch (error) {
        log.error({ err: error }, 'Retainer.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/retainer/:id — fetch one. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const ret = await findScoped(req, res);
    if (!ret) return undefined;
    return res.status(200).json({ message: "Found.", retainer: ret });
};

/** GET /v1/retainer/bycustomer/:id — a customer's retainers. Secure-404 scoped. */
exports.listByCustomer = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const custId = Number(req.params.id);
    if (!Number.isInteger(custId) || custId <= 0) {
        return res.status(400).json({ message: "Invalid customer id." });
    }

    let custCompanyId;
    try {
        custCompanyId = await GetCompanyIdByCustomerId(custId);
    } catch (error) {
        log.error({ err: error }, 'retainer listByCustomer: company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (custCompanyId === -1) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== custCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await Retainer.findAndCountAll({
            where: { retCustId: custId },
            limit,
            offset,
            order: [['retId', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, retainers: rows });
    } catch (error) {
        log.error({ err: error }, 'Retainer.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** PATCH /v1/retainer/:id — only the note is editable here. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const ret = await findScoped(req, res);
    if (!ret) return undefined;

    const body = req.body || {};
    if (body.retNote === undefined) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }
    try {
        await ret.update({ retNote: body.retNote });
        return res.status(200).json({ message: "Updated.", retainer: ret });
    } catch (error) {
        log.error({ err: error }, 'Retainer.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/retainer/:id/drawdown — draw an amount down from the balance.
 * 409 when the amount exceeds the remaining balance. Exact-cent.
 */
exports.drawdown = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const ret = await findScoped(req, res);
    if (!ret) return undefined;

    const amount = money.round(Number(req.body && req.body.amount));
    if (!(amount > 0)) {
        return res.status(400).json({ message: "amount must be a positive number." });
    }
    const newBalance = money.subtract(ret.retBalance, amount);
    if (newBalance < 0) {
        return res.status(409).json({ message: "Drawdown exceeds the retainer balance." });
    }
    try {
        await ret.update({ retBalance: newBalance });
        return res.status(200).json({ message: "Retainer drawn down.", retainer: ret });
    } catch (error) {
        log.error({ err: error }, 'Retainer drawdown failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/retainer/:id — soft-delete (sets retArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const ret = await findScoped(req, res);
    if (!ret) return undefined;
    try {
        await ret.update({ retArch: true });
        return res.status(200).json({ message: "Archived.", id: ret.retId });
    } catch (error) {
        log.error({ err: error }, 'Retainer archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
