// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { normalizeLevels, nextStep, canApproveAt } = require('../services/approval-chain.js');
const ApprovalChain = db.ApprovalChain;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

/** Load a chain and enforce the secure-404 company scope. */
async function findScoped(req, res) {
    let chain;
    try {
        chain = await ApprovalChain.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'ApprovalChain.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!chain || chain.apchArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await IsMaster(req.get('authKey'));
    if (!isMaster) {
        const companyId = await GetCompanyId(req.get('authKey'));
        if (companyId === -1 || chain.apchCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return chain;
}

/** POST /v1/approvalchain — define an approval chain for a company. */
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
    let companyId;
    if (!isMaster) {
        try {
            companyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (body.apchCompId !== undefined && Number(body.apchCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot define a chain for a company you do not belong to." });
        }
    } else {
        companyId = Number(body.apchCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify apchCompId." });
        }
    }

    const normalized = normalizeLevels(body.apchLevels);
    if (normalized.error) {
        return res.status(400).json({ message: normalized.error });
    }

    try {
        const created = await ApprovalChain.create({
            apchCompId: companyId,
            apchName: body.apchName,
            apchLevels: normalized.levels,
            apchActive: true,
            apchArch: false,
        });
        return res.status(201).json({ message: "Approval chain created.", approvalChain: created });
    } catch (error) {
        log.error({ err: error }, 'ApprovalChain.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/approvalchain/:id — fetch one. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const chain = await findScoped(req, res);
    if (!chain) return undefined;
    return res.status(200).json({ message: "Found.", approvalChain: chain });
};

/** GET /v1/approvalchain/bycompany/:id — list a company's chains. */
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
        const { count, rows } = await ApprovalChain.findAndCountAll({
            where: { apchCompId: targetCompanyId },
            limit,
            offset,
            order: [['apchId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, approvalChains: rows });
    } catch (error) {
        log.error({ err: error }, 'ApprovalChain.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/approvalchain/:id/next?approvals=n[&actorRole=r] — given how many
 * approvals have been recorded, the next required level/role (and, if
 * actorRole is supplied, whether that actor may approve it).
 */
exports.next = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const chain = await findScoped(req, res);
    if (!chain) return undefined;

    const approvals = parseInt(req.query.approvals, 10) || 0;
    const step = nextStep(chain.apchLevels, approvals);
    const payload = { message: "Next approval step.", apchId: chain.apchId, approvalsSoFar: approvals, ...step };
    if (req.query.actorRole !== undefined) {
        payload.canApprove = canApproveAt(chain.apchLevels, approvals, req.query.actorRole);
    }
    return res.status(200).json(payload);
};

/** PATCH /v1/approvalchain/:id — partial update. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const chain = await findScoped(req, res);
    if (!chain) return undefined;

    const body = req.body || {};
    const updates = {};
    if (body.apchName !== undefined) updates.apchName = body.apchName;
    if (body.apchActive !== undefined) updates.apchActive = body.apchActive;
    if (body.apchLevels !== undefined) {
        const normalized = normalizeLevels(body.apchLevels);
        if (normalized.error) {
            return res.status(400).json({ message: normalized.error });
        }
        updates.apchLevels = normalized.levels;
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await chain.update(updates);
        return res.status(200).json({ message: "Updated.", approvalChain: chain });
    } catch (error) {
        log.error({ err: error }, 'ApprovalChain.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/approvalchain/:id — soft-delete (sets apchArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const chain = await findScoped(req, res);
    if (!chain) return undefined;

    try {
        await chain.update({ apchArch: true });
        return res.status(200).json({ message: "Archived.", id: chain.apchId });
    } catch (error) {
        log.error({ err: error }, 'ApprovalChain archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
