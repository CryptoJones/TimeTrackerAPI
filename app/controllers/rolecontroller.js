// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const Role = db.Role;

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

const ALLOWED_FIELDS_CREATE = ['roleName', 'roleRate', 'roleCompId'];
const ALLOWED_FIELDS_UPDATE = ['roleName', 'roleRate'];

/**
 * POST /v1/role — create a billing role in a company. Master keys must
 * supply roleCompId; non-master keys default it to their own company
 * (a different one is a 403).
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMaster;
    try {
        isMaster = await MasterFromReq(req, authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }

    if (!isMaster) {
        let companyId;
        try {
            companyId = await CompanyIdFromReq(req, authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (payload.roleCompId !== undefined && Number(payload.roleCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot create a role for a company you do not belong to." });
        }
        payload.roleCompId = companyId;
    } else if (payload.roleCompId === undefined || Number(payload.roleCompId) <= 0) {
        return res.status(400).json({ message: "Master-key requests must specify roleCompId." });
    }

    payload.roleArch = false;

    try {
        const created = await Role.create(payload);
        return res.status(201).json({ message: "Role created.", role: created });
    } catch (error) {
        log.error({ err: error }, 'Role.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** Load a role and enforce the secure-404 scope. Returns the role or null (after responding). */
async function findScoped(req, res) {
    let role;
    try {
        role = await Role.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Role.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!role || role.roleArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    const isMaster = await MasterFromReq(req, req.get('authKey'));
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, req.get('authKey'));
        // Cross-tenant single-entity reads are 404, not 403 (anti-enumeration).
        if (companyId === -1 || role.roleCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return role;
}

/** GET /v1/role/:id — fetch one role. Secure-404 scoped. */
exports.getById = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const role = await findScoped(req, res);
    if (!role) return undefined;
    return res.status(200).json({ message: "Found.", role });
};

/** GET /v1/role/bycompany/:id — list a company's roles (paginated). */
exports.listByCompany = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetCompanyId = Number(req.params.id);
    if (!Number.isInteger(targetCompanyId) || targetCompanyId <= 0) {
        return res.status(400).json({ message: "Invalid company id." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== targetCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    try {
        const { count, rows } = await Role.findAndCountAll({
            where: { roleCompId: targetCompanyId },
            limit,
            offset,
            order: [['roleId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, roles: rows });
    } catch (error) {
        log.error({ err: error }, 'Role.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** PATCH /v1/role/:id — partial update. roleCompId / roleArch not settable here. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const role = await findScoped(req, res);
    if (!role) return undefined;

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await role.update(updates);
        return res.status(200).json({ message: "Updated.", role });
    } catch (error) {
        log.error({ err: error }, 'Role.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/role/:id — soft-delete (sets roleArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const role = await findScoped(req, res);
    if (!role) return undefined;

    try {
        await role.update({ roleArch: true });
        return res.status(200).json({ message: "Archived.", id: role.roleId });
    } catch (error) {
        log.error({ err: error }, 'Role archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};
