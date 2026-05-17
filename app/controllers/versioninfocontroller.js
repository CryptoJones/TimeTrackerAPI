// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * VersionInfo controller.
 *
 * Global table — no compId. Reads are open to any auth'd caller;
 * mutations (POST, PATCH, DELETE) require a master key. The schema
 * has no archive column, so DELETE physically destroys the row.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const VersionInfo = db.VersionInfo;

const IsMaster = auth.isMaster;

const ALLOWED_FIELDS = ['viVersion', 'viDate'];

async function requireMaster(authKey, res) {
    if (!authKey) {
        res.status(403).json({ message: "Authorization key not sent." });
        return false;
    }
    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        res.status(403).json({ message: "Only master keys may mutate VersionInfo." });
        return false;
    }
    return true;
}

exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!(await requireMaster(authKey, res))) return;

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    try {
        const created = await VersionInfo.create(payload);
        return res.status(201).json({ message: "VersionInfo created.", versionInfo: created });
    } catch (error) {
        log.error({ err: error }, 'VersionInfo.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    try {
        const v = await VersionInfo.findByPk(req.params.id);
        if (!v) return res.status(404).json({ message: "Not found." });
        return res.status(200).json({ message: "Found.", versionInfo: v });
    } catch (error) {
        log.error({ err: error }, 'VersionInfo.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.list = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
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
        const { count, rows } = await VersionInfo.findAndCountAll({
            limit, offset,
            order: [['viDate', 'DESC']],
        });
        return res.status(200).json({
            message: "Successfully retrieved version info",
            count, limit, offset, versionInfos: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'VersionInfo.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!(await requireMaster(authKey, res))) return;

    let v;
    try {
        v = await VersionInfo.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'VersionInfo.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!v) return res.status(404).json({ message: "Not found." });

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await v.update(updates);
        return res.status(200).json({ message: "Updated.", versionInfo: v });
    } catch (error) {
        log.error({ err: error }, 'VersionInfo.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!(await requireMaster(authKey, res))) return;

    let v;
    try {
        v = await VersionInfo.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'VersionInfo.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!v) return res.status(404).json({ message: "Not found." });

    try {
        await v.destroy();
        return res.status(200).json({ message: "Deleted.", id: req.params.id });
    } catch (error) {
        log.error({ err: error }, 'VersionInfo.destroy failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster };
