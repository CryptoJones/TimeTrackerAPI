// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { validateAgainstDefs } = require('../services/custom-field.js');
const CustomFieldDef = db.CustomFieldDef;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

/** Load a def and enforce the secure-404 company scope. */
async function findScoped(req, res) {
    let def;
    try {
        def = await CustomFieldDef.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'CustomFieldDef.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!def || def.cfdArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await IsMaster(req.get('authKey'));
    if (!isMaster) {
        const companyId = await GetCompanyId(req.get('authKey'));
        if (companyId === -1 || def.cfdCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return def;
}

/** Resolve the target company (or null after responding). Master keys pass companyId. */
async function resolveCompany(req, res, fromBody) {
    const authKey = req.get('authKey');
    if (!authKey) {
        res.status(403).json({ message: "Authorization key not sent." });
        return null;
    }
    const isMaster = await IsMaster(authKey);
    if (isMaster) {
        const companyId = Number(fromBody ? (req.body || {}).companyId : req.query.companyId);
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

/** POST /v1/customfield — declare a custom field. */
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
        if (body.cfdCompId !== undefined && Number(body.cfdCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot define a field for a company you do not belong to." });
        }
    } else {
        companyId = Number(body.cfdCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify cfdCompId." });
        }
    }

    // Enforce name uniqueness per (company, entity).
    try {
        const existing = await CustomFieldDef.findOne({ where: { cfdCompId: companyId, cfdEntity: body.cfdEntity, cfdName: body.cfdName } });
        if (existing) {
            return res.status(409).json({ message: "A field with that name already exists for this entity." });
        }
    } catch (error) {
        log.error({ err: error }, 'CustomFieldDef uniqueness check failed');
        return res.status(500).json({ message: "Error!" });
    }

    try {
        const created = await CustomFieldDef.create({
            cfdCompId: companyId,
            cfdEntity: body.cfdEntity,
            cfdName: body.cfdName,
            cfdLabel: body.cfdLabel,
            cfdType: body.cfdType,
            cfdRequired: body.cfdRequired === true,
            cfdArch: false,
        });
        return res.status(201).json({ message: "Custom field created.", customField: created });
    } catch (error) {
        log.error({ err: error }, 'CustomFieldDef.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/customfield/:id — fetch one. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const def = await findScoped(req, res);
    if (!def) return undefined;
    return res.status(200).json({ message: "Found.", customField: def });
};

/** GET /v1/customfield/bycompany/:id — list a company's fields (optional ?entity). */
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

    const where = { cfdCompId: targetCompanyId };
    if (typeof req.query.entity === 'string' && req.query.entity) where.cfdEntity = req.query.entity;

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await CustomFieldDef.findAndCountAll({
            where,
            limit,
            offset,
            order: [['cfdId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, customFields: rows });
    } catch (error) {
        log.error({ err: error }, 'CustomFieldDef.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/customfield/validate — validate a values object against the
 * company's defs for an entity. 200 { valid:true, values } or 422
 * { valid:false, errors }.
 */
exports.validate = async (req, res) => {
    const companyId = await resolveCompany(req, res, true);
    if (companyId === null) return undefined;
    const body = req.body || {};

    let defs;
    try {
        defs = await CustomFieldDef.findAll({ where: { cfdCompId: companyId, cfdEntity: body.entity } });
    } catch (error) {
        log.error({ err: error }, 'CustomFieldDef.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const result = validateAgainstDefs(defs, body.values);
    if (result.errors) {
        return res.status(422).json({ message: "Custom field validation failed.", valid: false, errors: result.errors });
    }
    return res.status(200).json({ message: "Valid.", valid: true, values: result.values });
};

/** PATCH /v1/customfield/:id — partial update. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const def = await findScoped(req, res);
    if (!def) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of ['cfdName', 'cfdLabel', 'cfdType', 'cfdRequired']) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await def.update(updates);
        return res.status(200).json({ message: "Updated.", customField: def });
    } catch (error) {
        log.error({ err: error }, 'CustomFieldDef.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/customfield/:id — soft-delete (sets cfdArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const def = await findScoped(req, res);
    if (!def) return undefined;

    try {
        await def.update({ cfdArch: true });
        return res.status(200).json({ message: "Archived.", id: def.cfdId });
    } catch (error) {
        log.error({ err: error }, 'CustomFieldDef archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
