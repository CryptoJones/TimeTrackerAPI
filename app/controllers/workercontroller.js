// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const Worker = db.Worker;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = [
    'workerFName', 'workerLName', 'workerTitle',
    'workerDefaultBillType', 'workerCompId',
];
const ALLOWED_FIELDS_UPDATE = [
    'workerFName', 'workerLName', 'workerTitle', 'workerDefaultBillType',
];

/**
 * POST /v1/worker — create a worker in a company.
 *
 * Master keys must supply workerCompId. Non-master keys: workerCompId
 * defaults to the authKey's owning company; supplying a different one
 * is a 403.
 */
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
        if (payload.workerCompId !== undefined && Number(payload.workerCompId) !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot create a worker for a company you do not belong to.",
            });
        }
        payload.workerCompId = authKeyCompanyId;
    } else {
        if (payload.workerCompId === undefined || Number(payload.workerCompId) <= 0) {
            return res.status(400).json({
                message: "Master-key requests must specify workerCompId.",
            });
        }
    }

    payload.workerArch = false;

    try {
        const created = await Worker.create(payload);
        return res.status(201).json({
            message: "Worker created.",
            worker: created,
        });
    } catch (error) {
        log.error({ err: error }, 'Worker.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * GET /v1/worker/:id — fetch a single worker by id.
 *
 * Non-master keys may only read workers whose workerCompId matches
 * their own akCompanyId.
 */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let worker;
    try {
        worker = await Worker.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Worker.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!worker || worker.workerArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || worker.workerCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", worker });
};

/**
 * GET /v1/worker/bycompany/:id — list workers for a company (paginated).
 *
 * Non-master keys: :id must match the authKey's owning company.
 */
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
        const { count, rows } = await Worker.findAndCountAll({
            where: { workerCompId: targetCompanyId, workerArch: false },
            limit,
            offset,
            order: [['workerId', 'ASC']],
        });
        return res.status(200).json({
            message: "Successfully retrieved workers with CompanyId " + targetCompanyId,
            count,
            limit,
            offset,
            workers: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Worker.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * PATCH /v1/worker/:id — partial update.
 *
 * workerCompId / workerArch are server-managed and not user-settable here.
 */
exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let worker;
    try {
        worker = await Worker.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Worker.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!worker || worker.workerArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || worker.workerCompId !== companyId) {
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
        await worker.update(updates);
        return res.status(200).json({ message: "Updated.", worker });
    } catch (error) {
        log.error({ err: error }, 'Worker.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * DELETE /v1/worker/:id — soft-delete (sets workerArch = true).
 *
 * Workers are never physically removed via the API.
 */
exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let worker;
    try {
        worker = await Worker.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Worker.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!worker || worker.workerArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || worker.workerCompId !== companyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await worker.update({ workerArch: true });
        return res.status(200).json({ message: "Archived.", id: worker.workerId });
    } catch (error) {
        log.error({ err: error }, 'Worker archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster, GetCompanyId };
