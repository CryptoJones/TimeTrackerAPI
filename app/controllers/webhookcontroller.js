// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { deliver } = require('../services/webhook-delivery.js');
const Webhook = db.Webhook;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = ['whkUrl', 'whkEvent', 'whkSecret', 'whkCompId'];
const ALLOWED_FIELDS_UPDATE = ['whkUrl', 'whkEvent', 'whkSecret', 'whkActive'];
// whkSecret is deliberately excluded — it is write-only at the API layer.
const SAFE_ATTRS = ['whkId', 'whkCompId', 'whkUrl', 'whkEvent', 'whkActive', 'whkArch', 'createdAt', 'updatedAt'];

/** A response-safe view of a webhook row (never includes the secret). */
function safeView(wh) {
    return {
        whkId: wh.whkId,
        whkCompId: wh.whkCompId,
        whkUrl: wh.whkUrl,
        whkEvent: wh.whkEvent,
        whkActive: wh.whkActive,
        whkArch: wh.whkArch,
    };
}

/** Load a webhook (with secret, for signing) and enforce the secure-404 scope. */
async function findScoped(req, res) {
    let wh;
    try {
        wh = await Webhook.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Webhook.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!wh || wh.whkArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await IsMaster(req.get('authKey'));
    if (!isMaster) {
        const companyId = await GetCompanyId(req.get('authKey'));
        if (companyId === -1 || wh.whkCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return wh;
}

/** POST /v1/webhook — register a webhook. Non-master keys default whkCompId to their own company. */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMaster;
    try {
        isMaster = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }

    if (!isMaster) {
        let companyId;
        try {
            companyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (payload.whkCompId !== undefined && Number(payload.whkCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot register a webhook for a company you do not belong to." });
        }
        payload.whkCompId = companyId;
    } else if (payload.whkCompId === undefined || Number(payload.whkCompId) <= 0) {
        return res.status(400).json({ message: "Master-key requests must specify whkCompId." });
    }

    payload.whkActive = true;
    payload.whkArch = false;

    try {
        const created = await Webhook.create(payload);
        return res.status(201).json({ message: "Webhook registered.", webhook: safeView(created) });
    } catch (error) {
        log.error({ err: error }, 'Webhook.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/webhook/:id — fetch one (metadata only). Secure-404 scoped. */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let wh;
    try {
        wh = await Webhook.findByPk(req.params.id, { attributes: SAFE_ATTRS });
    } catch (error) {
        log.error({ err: error }, 'Webhook.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!wh || wh.whkArch) {
        return res.status(404).json({ message: "Not found." });
    }
    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || wh.whkCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", webhook: wh });
};

/** GET /v1/webhook/bycompany/:id — list a company's webhooks (metadata only). */
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
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await Webhook.findAndCountAll({
            where: { whkCompId: targetCompanyId },
            attributes: SAFE_ATTRS,
            limit,
            offset,
            order: [['whkId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, webhooks: rows });
    } catch (error) {
        log.error({ err: error }, 'Webhook.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** PATCH /v1/webhook/:id — partial update. whkCompId / whkArch not settable here. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const wh = await findScoped(req, res);
    if (!wh) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await wh.update(updates);
        return res.status(200).json({ message: "Updated.", webhook: safeView(wh) });
    } catch (error) {
        log.error({ err: error }, 'Webhook.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/webhook/:id/ping — deliver a test 'ping' event to the
 * endpoint and report the outcome. Verifies URL + signing end to end.
 */
exports.ping = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const wh = await findScoped(req, res);
    if (!wh) return undefined;

    const result = await deliver(wh, 'ping', { whkId: wh.whkId, message: 'ping' });
    return res.status(200).json({
        message: result.ok ? "Ping delivered." : "Ping attempted.",
        delivered: !!result.ok,
        status: result.status != null ? result.status : null,
        error: result.error || null,
    });
};

/** DELETE /v1/webhook/:id — soft-delete (sets whkArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const wh = await findScoped(req, res);
    if (!wh) return undefined;

    try {
        await wh.update({ whkArch: true });
        return res.status(200).json({ message: "Archived.", id: wh.whkId });
    } catch (error) {
        log.error({ err: error }, 'Webhook archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
