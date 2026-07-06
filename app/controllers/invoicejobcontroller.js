// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * InvoiceJob controller. Job-scoped — auth resolves via
 * injbJobId → Job.jobCustId → Customer.custCompId.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreateIndirect } = require('./_bulk-helpers.js');
const InvoiceJob = db.InvoiceJob;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCompanyIdByJobId = auth.getCompanyIdByJobId;
// #374: prefer attachAuth's resolved context in the handlers below; the
// raw IsMaster / GetCompanyId above are retained only for the _internals
// test seam.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

const ALLOWED_FIELDS_CREATE = ['injbInvId', 'injbJobId', 'injbAmount'];
const ALLOWED_FIELDS_UPDATE = ['injbAmount'];

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
    if (!payload.injbJobId || !payload.injbInvId) {
        return res.status(400).json({ message: "injbInvId and injbJobId are required." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const jobCompanyId = await GetCompanyIdByJobId(payload.injbJobId);
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(403).json({
                message: "Cannot create an invoice line for a job in a company you do not belong to.",
            });
        }
    }

    payload.injbArch = false;

    try {
        const created = await InvoiceJob.create(payload);
        return res.status(201).json({ message: "Invoice line created.", invoiceJob: created });
    } catch (error) {
        log.error({ err: error }, 'InvoiceJob.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoiceJob;
    try {
        invoiceJob = await InvoiceJob.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InvoiceJob.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoiceJob || invoiceJob.injbArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const jobCompanyId = await GetCompanyIdByJobId(invoiceJob.injbJobId);
        // Cross-tenant access is reported as 404, not 403 — otherwise
        // a scoped caller can enumerate which InvoiceJob ids are
        // populated across the whole tenant table by status code.
        // Same secure-404 pattern as the prior 12 entities (#174
        // through #230).
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", invoiceJob });
};

exports.listByInvoice = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetInvoiceId = Number(req.params.id);
    if (!Number.isInteger(targetInvoiceId) || targetInvoiceId <= 0) {
        return res.status(400).json({ message: "Invalid invoice id." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    // For non-master, we'd want to verify the invoice's company. To keep
    // this lookup cheap we resolve a single row from InvoiceJob and walk
    // its job to compId. If the invoice has no lines yet, non-master
    // callers get 403 (they can use the Invoice GET to verify access first).
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        if (authCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const sample = await InvoiceJob.findOne({ where: { injbInvId: targetInvoiceId } });
        if (sample) {
            const jobCompanyId = await GetCompanyIdByJobId(sample.injbJobId);
            if (jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
                return res.status(403).json({ message: "Invalid Authorization Key." });
            }
        }
        // sample === null: invoice has no lines yet. We can't verify
        // company from InvoiceJob alone, so 403 conservatively. Callers
        // who legitimately have access can GET the Invoice first to
        // confirm scope, then create lines.
        if (!sample) {
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
        const { count, rows } = await InvoiceJob.findAndCountAll({
            where: { injbInvId: targetInvoiceId },
            limit, offset,
            order: [['injbId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Successfully retrieved invoice lines for InvoiceId " + targetInvoiceId,
            count, limit, offset, invoiceJobs: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'InvoiceJob.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoiceJob;
    try {
        invoiceJob = await InvoiceJob.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InvoiceJob.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoiceJob || invoiceJob.injbArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const jobCompanyId = await GetCompanyIdByJobId(invoiceJob.injbJobId);
        // Secure-404 on PATCH for the same reason as GET.
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
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
        await invoiceJob.update(updates);
        return res.status(200).json({ message: "Updated.", invoiceJob });
    } catch (error) {
        log.error({ err: error }, 'InvoiceJob.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invoiceJob;
    try {
        invoiceJob = await InvoiceJob.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'InvoiceJob.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoiceJob || invoiceJob.injbArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const authCompanyId = await CompanyIdFromReq(req, authKey);
        const jobCompanyId = await GetCompanyIdByJobId(invoiceJob.injbJobId);
        // Secure-404 on DELETE for the same reason as GET / PATCH.
        if (authCompanyId === -1 || jobCompanyId === -1 || authCompanyId !== jobCompanyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await invoiceJob.update({ injbArch: true });
        return res.status(200).json({ message: "Archived.", id: invoiceJob.injbId });
    } catch (error) {
        log.error({ err: error }, 'InvoiceJob archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports.bulkCreate = makeBulkCreateIndirect({
    Model: InvoiceJob,
    modelKey: 'InvoiceJob',
    parentFkField: 'injbJobId',
    resolveParentCompanyId: auth.getCompanyIdByJobId,
    allowedFields: ALLOWED_FIELDS_CREATE,
    archField: 'injbArch',
    bodyKey: 'invoiceJobs',
    createdKey: 'invoiceJobs',
});

exports._internals = { IsMaster, GetCompanyId, GetCompanyIdByJobId };
