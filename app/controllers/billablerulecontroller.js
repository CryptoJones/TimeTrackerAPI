// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { evaluate } = require('../services/billable-rules.js');
const BillableRule = db.BillableRule;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const MATCH_FIELDS = ['bruName', 'bruPriority', 'bruMatchJobId', 'bruMatchTaskId', 'bruMatchCategory', 'bruBillable', 'bruActive'];

/** Load a rule and enforce the secure-404 company scope. */
async function findScoped(req, res) {
    let rule;
    try {
        rule = await BillableRule.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'BillableRule.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!rule || rule.bruArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await IsMaster(req.get('authKey'));
    if (!isMaster) {
        const companyId = await GetCompanyId(req.get('authKey'));
        if (companyId === -1 || rule.bruCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return rule;
}

/** Resolve the target company (or null after responding). Master keys pass companyId (body). */
async function resolveCompany(req, res) {
    const authKey = req.get('authKey');
    if (!authKey) {
        res.status(403).json({ message: "Authorization key not sent." });
        return null;
    }
    const isMaster = await IsMaster(authKey);
    if (isMaster) {
        const companyId = Number((req.body || {}).companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            res.status(400).json({ message: "Master-key requests must specify companyId." });
            return null;
        }
        return companyId;
    }
    const companyId = await GetCompanyId(authKey);
    if (companyId === -1) {
        res.status(403).json({ message: "Invalid Authorization Key." });
        return null;
    }
    return companyId;
}

/** POST /v1/billablerule — define a billable-classification rule. */
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
        if (body.bruCompId !== undefined && Number(body.bruCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot define a rule for a company you do not belong to." });
        }
    } else {
        companyId = Number(body.bruCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify bruCompId." });
        }
    }

    try {
        const created = await BillableRule.create({
            bruCompId: companyId,
            bruName: body.bruName,
            bruPriority: body.bruPriority == null ? 100 : body.bruPriority,
            bruMatchJobId: body.bruMatchJobId == null ? null : body.bruMatchJobId,
            bruMatchTaskId: body.bruMatchTaskId == null ? null : body.bruMatchTaskId,
            bruMatchCategory: body.bruMatchCategory == null ? null : body.bruMatchCategory,
            bruBillable: body.bruBillable === true,
            bruActive: true,
            bruArch: false,
        });
        return res.status(201).json({ message: "Billable rule created.", billableRule: created });
    } catch (error) {
        log.error({ err: error }, 'BillableRule.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/billablerule/:id — fetch one. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const rule = await findScoped(req, res);
    if (!rule) return undefined;
    return res.status(200).json({ message: "Found.", billableRule: rule });
};

/** GET /v1/billablerule/bycompany/:id — list a company's rules (priority order). */
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
        const { count, rows } = await BillableRule.findAndCountAll({
            where: { bruCompId: targetCompanyId },
            limit,
            offset,
            order: [['bruPriority', 'ASC'], ['bruId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, billableRules: rows });
    } catch (error) {
        log.error({ err: error }, 'BillableRule.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/billablerule/evaluate — classify a { jobId, taskId, category }
 * context against the company's rules. Returns { billable, matchedRuleId }
 * (billable null when no rule matches).
 */
exports.evaluate = async (req, res) => {
    const companyId = await resolveCompany(req, res);
    if (companyId === null) return undefined;
    const body = req.body || {};

    let rules;
    try {
        rules = await BillableRule.findAll({ where: { bruCompId: companyId, bruActive: true } });
    } catch (error) {
        log.error({ err: error }, 'BillableRule.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const result = evaluate(rules, { jobId: body.jobId, taskId: body.taskId, category: body.category });
    return res.status(200).json({ message: "Evaluated.", companyId, ...result });
};

/** PATCH /v1/billablerule/:id — partial update. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const rule = await findScoped(req, res);
    if (!rule) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of MATCH_FIELDS) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await rule.update(updates);
        return res.status(200).json({ message: "Updated.", billableRule: rule });
    } catch (error) {
        log.error({ err: error }, 'BillableRule.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/billablerule/:id — soft-delete (sets bruArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const rule = await findScoped(req, res);
    if (!rule) return undefined;

    try {
        await rule.update({ bruArch: true });
        return res.status(200).json({ message: "Archived.", id: rule.bruId });
    } catch (error) {
        log.error({ err: error }, 'BillableRule archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
