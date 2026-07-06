// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

// API-key lifecycle (#65): provision, rotate, revoke, and list company
// API keys. MASTER-ONLY — managing credentials is an admin operation.
//
// Only the SHA-256 hash of a key is ever stored (ApiKey.akKEY); the raw
// key is generated server-side and returned exactly ONCE (on create /
// rotate). It is never recoverable afterwards, and no endpoint ever
// returns the stored hash.

const crypto = require('crypto');
const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const ApiKey = db.ApiKey;

const IsMaster = auth.isMaster;
const hashKey = auth.hashKey;

// Metadata only — akKEY (the hash) is deliberately excluded.
const SAFE_ATTRS = ['akId', 'akCompanyId', 'akArchive', 'akArchiveDate', 'createdAt', 'updatedAt'];

/** A fresh 64-char hex API key (256 bits of entropy). */
function generateRawKey() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Gate to master keys. Responds (403/500) and returns false when the
 * caller is not an authenticated master key; returns true otherwise.
 */
async function requireMaster(req, res) {
    const authKey = req.get('authKey');
    if (!authKey) {
        res.status(403).json({ message: "Authorization key not sent." });
        return false;
    }
    let isMaster;
    try {
        isMaster = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'apikey: IsMaster failed');
        res.status(500).json({ message: "Error!" });
        return false;
    }
    if (!isMaster) {
        res.status(403).json({ message: "API-key management requires a master key." });
        return false;
    }
    return true;
}

/** POST /v1/apikey — provision a new key for a company. Returns the raw key once. */
exports.create = async (req, res) => {
    if (!(await requireMaster(req, res))) return undefined;

    const akCompanyId = Number((req.body || {}).akCompanyId);
    if (!Number.isInteger(akCompanyId) || akCompanyId <= 0) {
        return res.status(400).json({ message: "akCompanyId is required and must be an integer." });
    }

    const raw = generateRawKey();
    try {
        const created = await ApiKey.create({ akKEY: hashKey(raw), akCompanyId, akArchive: false });
        return res.status(201).json({
            message: "API key created. Store this key now — it will not be shown again.",
            apiKey: raw,
            akId: created.akId,
            akCompanyId,
        });
    } catch (error) {
        log.error({ err: error }, 'ApiKey.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/apikey/:id/rotate — replace a key's secret in place. The old
 * key stops working immediately; the new raw key is returned once.
 */
exports.rotate = async (req, res) => {
    if (!(await requireMaster(req, res))) return undefined;

    let key;
    try {
        key = await ApiKey.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'ApiKey.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!key || key.akArchive) {
        return res.status(404).json({ message: "Not found." });
    }

    const raw = generateRawKey();
    try {
        await key.update({ akKEY: hashKey(raw) });
        return res.status(200).json({
            message: "API key rotated. The previous key is now invalid. Store this key now — it will not be shown again.",
            apiKey: raw,
            akId: key.akId,
            akCompanyId: key.akCompanyId,
        });
    } catch (error) {
        log.error({ err: error }, 'ApiKey rotate failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/apikey/:id — revoke a key (soft-delete; fails auth lookups thereafter). */
exports.revoke = async (req, res) => {
    if (!(await requireMaster(req, res))) return undefined;

    let key;
    try {
        key = await ApiKey.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'ApiKey.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!key || key.akArchive) {
        return res.status(404).json({ message: "Not found." });
    }

    try {
        await key.update({ akArchive: true, akArchiveDate: new Date() });
        return res.status(200).json({ message: "API key revoked.", akId: key.akId });
    } catch (error) {
        log.error({ err: error }, 'ApiKey revoke failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/apikey/:id — fetch key metadata (never the hash). */
exports.getById = async (req, res) => {
    if (!(await requireMaster(req, res))) return undefined;

    let key;
    try {
        key = await ApiKey.findByPk(req.params.id, { attributes: SAFE_ATTRS });
    } catch (error) {
        log.error({ err: error }, 'ApiKey.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!key || key.akArchive) {
        return res.status(404).json({ message: "Not found." });
    }
    return res.status(200).json({ message: "Found.", apiKey: key });
};

/** GET /v1/apikey/bycompany/:id — list a company's keys (metadata only, paginated). */
exports.listByCompany = async (req, res) => {
    if (!(await requireMaster(req, res))) return undefined;

    const companyId = Number(req.params.id);
    if (!Number.isInteger(companyId) || companyId <= 0) {
        return res.status(400).json({ message: "Invalid company id." });
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await ApiKey.findAndCountAll({
            where: { akCompanyId: companyId },
            attributes: SAFE_ATTRS,
            limit,
            offset,
            order: [['akId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, apiKeys: rows });
    } catch (error) {
        log.error({ err: error }, 'ApiKey.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports._internals = { generateRawKey };
