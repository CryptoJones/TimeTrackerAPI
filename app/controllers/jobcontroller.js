// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Job controller. Customer-scoped — auth resolves via
 * jobCustId → Customer.custCompId. The helper for that lookup lives
 * in middleware/auth.js so InvoiceJob / ProductEntry (which scope
 * through Job) can chain on it.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const Job = db.Job;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;

const ALLOWED_FIELDS_CREATE = ['jobCustId', 'jobDesc'];
const ALLOWED_FIELDS_UPDATE = ['jobDesc', 'jobInvoiced'];

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
    if (!payload.jobCustId) {
        return res.status(400).json({ message: "jobCustId is required." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        if (authCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const custCompanyId = await GetCompanyIdByCustomerId(payload.jobCustId);
        if (custCompanyId === -1 || custCompanyId !== authCompanyId) {
            return res.status(403).json({
                message: "Cannot create a job for a customer in a company you do not belong to.",
            });
        }
    }

    payload.jobArch = false;
    payload.jobInvoiced = false;

    try {
        const created = await Job.create(payload);
        return res.status(201).json({ message: "Job created.", job: created });
    } catch (error) {
        log.error({ err: error }, 'Job.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let job;
    try {
        job = await Job.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Job.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!job || job.jobArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByCustomerId(job.jobCustId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }
    return res.status(200).json({ message: "Found.", job });
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
        const { count, rows } = await Job.findAndCountAll({
            where: { jobCustId: targetCustomerId },
            limit,
            offset,
            order: [['jobId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        res.setHeader('Access-Control-Expose-Headers', 'Link');
        return res.status(200).json({
            message: "Successfully retrieved jobs for CustomerId " + targetCustomerId,
            count, limit, offset, jobs: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Job.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let job;
    try {
        job = await Job.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Job.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!job || job.jobArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByCustomerId(job.jobCustId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
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
        await job.update(updates);
        return res.status(200).json({ message: "Updated.", job });
    } catch (error) {
        log.error({ err: error }, 'Job.update failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let job;
    try {
        job = await Job.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Job.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
    if (!job || job.jobArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const authCompanyId = await GetCompanyId(authKey);
        const jobCompanyId = await GetCompanyIdByCustomerId(job.jobCustId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    try {
        await job.update({ jobArch: true });
        return res.status(200).json({ message: "Archived.", id: job.jobId });
    } catch (error) {
        log.error({ err: error }, 'Job archive failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByCustomerId };
