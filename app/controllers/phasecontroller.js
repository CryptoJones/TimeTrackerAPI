// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const Phase = db.Phase;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByJobId = auth.getCompanyIdByJobId;

const ALLOWED_FIELDS_CREATE = ['phaseJobId', 'phaseName', 'phaseStartDate', 'phaseEndDate', 'phaseBudgetAmount'];
const ALLOWED_FIELDS_UPDATE = ['phaseName', 'phaseStartDate', 'phaseEndDate', 'phaseBudgetAmount'];

/**
 * POST /v1/phase — create a phase under a job. The job's company
 * (resolved through phaseJobId → Job → Customer) must be the caller's
 * company (master keys may target any).
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const body = req.body || {};
    const phaseJobId = Number(body.phaseJobId);
    if (!Number.isInteger(phaseJobId) || phaseJobId <= 0) {
        return res.status(400).json({ message: "phaseJobId is required and must be an integer." });
    }

    let jobCompanyId;
    try {
        jobCompanyId = await GetCompanyIdByJobId(phaseJobId);
    } catch (error) {
        log.error({ err: error }, 'phase create: job company resolve failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (jobCompanyId === -1) {
        return res.status(400).json({ message: "phaseJobId must reference a job." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || companyId !== jobCompanyId) {
            return res.status(403).json({ message: "Cannot create a phase for a job in a company you do not belong to." });
        }
    }

    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    payload.phaseArch = false;

    try {
        const created = await Phase.create(payload);
        return res.status(201).json({ message: "Phase created.", phase: created });
    } catch (error) {
        log.error({ err: error }, 'Phase.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/phase/:id — fetch one phase. Secure-404 scoped through its
 * job's company: a cross-tenant id reads as 404.
 */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let phase;
    try {
        phase = await Phase.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Phase.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!phase || phase.phaseArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        let phaseCompanyId;
        try {
            phaseCompanyId = await GetCompanyIdByJobId(phase.phaseJobId);
        } catch (error) {
            log.error({ err: error }, 'phase getById: company resolve failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1 || phaseCompanyId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", phase });
};

/**
 * GET /v1/phase/byjob/:id — list a job's phases. Secure-404 scoped
 * through the job's company (a job in another tenant reads as 404).
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
        log.error({ err: error }, 'phase listByJob: company resolve failed');
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
        const { count, rows } = await Phase.findAndCountAll({
            where: { phaseJobId: jobId },
            limit,
            offset,
            order: [['phaseStartDate', 'ASC'], ['phaseId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, phases: rows });
    } catch (error) {
        log.error({ err: error }, 'Phase.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** Load a phase and enforce the secure-404 scope. Returns the phase or null (after responding). */
async function findScoped(req, res) {
    let phase;
    try {
        phase = await Phase.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Phase.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!phase || phase.phaseArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await IsMaster(req.get('authKey'));
    if (!isMaster) {
        const companyId = await GetCompanyId(req.get('authKey'));
        let phaseCompanyId;
        try {
            phaseCompanyId = await GetCompanyIdByJobId(phase.phaseJobId);
        } catch (error) {
            log.error({ err: error }, 'phase scope: company resolve failed');
            res.status(500).json({ message: "Error!" });
            return null;
        }
        if (companyId === -1 || phaseCompanyId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return phase;
}

/** PATCH /v1/phase/:id — partial update. phaseJobId / phaseArch not settable here. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const phase = await findScoped(req, res);
    if (!phase) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await phase.update(updates);
        return res.status(200).json({ message: "Updated.", phase });
    } catch (error) {
        log.error({ err: error }, 'Phase.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/phase/:id — soft-delete (sets phaseArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const phase = await findScoped(req, res);
    if (!phase) return undefined;

    try {
        await phase.update({ phaseArch: true });
        return res.status(200).json({ message: "Archived.", id: phase.phaseId });
    } catch (error) {
        log.error({ err: error }, 'Phase archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
