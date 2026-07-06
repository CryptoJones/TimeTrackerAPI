// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const Task = db.Task;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByJobId = auth.getCompanyIdByJobId;

const ALLOWED_FIELDS_CREATE = ['taskJobId', 'taskName', 'taskDesc'];
const ALLOWED_FIELDS_UPDATE = ['taskName', 'taskDesc'];

/**
 * POST /v1/task — create a task under a job. The job's company (resolved
 * through taskJobId → Job → Customer) must be the caller's company
 * (master keys may target any).
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const body = req.body || {};
    const taskJobId = Number(body.taskJobId);
    if (!Number.isInteger(taskJobId) || taskJobId <= 0) {
        return res.status(400).json({ message: "taskJobId is required and must be an integer." });
    }

    let jobCompanyId;
    try {
        jobCompanyId = await GetCompanyIdByJobId(taskJobId);
    } catch (error) {
        log.error({ err: error }, 'task create: job company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (jobCompanyId === -1) {
        return res.status(400).json({ message: "taskJobId must reference a job." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || companyId !== jobCompanyId) {
            return res.status(403).json({ message: "Cannot create a task for a job in a company you do not belong to." });
        }
    }

    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    payload.taskArch = false;

    try {
        const created = await Task.create(payload);
        return res.status(201).json({ message: "Task created.", task: created });
    } catch (error) {
        log.error({ err: error }, 'Task.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/task/:id — fetch one task. Secure-404 scoped through its job's
 * company: a cross-tenant id reads as 404.
 */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let task;
    try {
        task = await Task.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Task.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!task || task.taskArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        let taskCompanyId;
        try {
            taskCompanyId = await GetCompanyIdByJobId(task.taskJobId);
        } catch (error) {
            log.error({ err: error }, 'task getById: company resolve failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1 || taskCompanyId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", task });
};

/**
 * GET /v1/task/byjob/:id — list a job's tasks. Secure-404 scoped through
 * the job's company (a job in another tenant reads as 404).
 */
exports.listByJob = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ message: "Invalid job id." });
    }

    let jobCompanyId;
    try {
        jobCompanyId = await GetCompanyIdByJobId(jobId);
    } catch (error) {
        log.error({ err: error }, 'task listByJob: company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (jobCompanyId === -1) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || companyId !== jobCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await Task.findAndCountAll({
            where: { taskJobId: jobId },
            limit,
            offset,
            order: [['taskId', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, tasks: rows });
    } catch (error) {
        log.error({ err: error }, 'Task.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** Load a task and enforce the secure-404 scope. Returns the task or null (after sending the response). */
async function findScoped(req, res) {
    let task;
    try {
        task = await Task.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Task.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!task || task.taskArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await IsMaster(req.get('authKey'));
    if (!isMaster) {
        const companyId = await GetCompanyId(req.get('authKey'));
        let taskCompanyId;
        try {
            taskCompanyId = await GetCompanyIdByJobId(task.taskJobId);
        } catch (error) {
            log.error({ err: error }, 'task scope: company resolve failed');
            res.status(500).json({ message: "Error!" });
            return null;
        }
        if (companyId === -1 || taskCompanyId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return task;
}

/** PATCH /v1/task/:id — partial update. taskJobId / taskArch not settable here. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const task = await findScoped(req, res);
    if (!task) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await task.update(updates);
        return res.status(200).json({ message: "Updated.", task });
    } catch (error) {
        log.error({ err: error }, 'Task.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/task/:id — soft-delete (sets taskArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const task = await findScoped(req, res);
    if (!task) return undefined;

    try {
        await task.update({ taskArch: true });
        return res.status(200).json({ message: "Archived.", id: task.taskId });
    } catch (error) {
        log.error({ err: error }, 'Task archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
