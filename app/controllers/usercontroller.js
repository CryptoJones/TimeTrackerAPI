// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { hashPassword } = require('../services/password.js');
const rbac = require('../services/rbac.js');
const User = db.User;

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

// userPasswordHash is deliberately excluded — it is write-only.
const SAFE_ATTRS = ['userId', 'userCompId', 'userEmail', 'userName', 'userRole', 'userArch', 'createdAt', 'updatedAt'];

/** A response-safe view of a user row (never includes the password hash). */
function safeView(u) {
    return {
        userId: u.userId,
        userCompId: u.userCompId,
        userEmail: u.userEmail,
        userName: u.userName,
        userRole: u.userRole,
        userArch: u.userArch,
    };
}

/**
 * Load a user and enforce the secure-404 company scope for EITHER a
 * signed-in user (req.user, Bearer JWT — the RBAC actor) or an API key. A
 * JWT actor is scoped to its own company; the API-key path keeps the
 * master / company-match behavior. 403s if neither auth is present.
 */
async function findScoped(req, res) {
    if (!req.user && !req.get('authKey')) {
        res.status(403).json({ message: "Authorization required." });
        return null;
    }
    let user;
    try {
        user = await User.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'User.findByPk failed');
        res.status(500).json({ message: "Error!" });
        return null;
    }
    if (!user || user.userArch) {
        res.status(404).json({ message: "Not found." });
        return null;
    }
    if (req.user) {
        // A signed-in user acts only within its own company (secure-404).
        if (user.userCompId !== req.user.userCompId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
        return user;
    }
    const isMaster = await MasterFromReq(req, req.get('authKey'));
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, req.get('authKey'));
        if (companyId === -1 || user.userCompId !== companyId) {
            res.status(404).json({ message: "Not found." });
            return null;
        }
    }
    return user;
}

/** POST /v1/user — create a user account. Non-master defaults userCompId to its own company. */
/** Shared tail of create: email-uniqueness check within the company, then insert. */
async function insertUser(res, companyId, role, body) {
    try {
        const existing = await User.findOne({ where: { userCompId: companyId, userEmail: body.userEmail } });
        if (existing) {
            return res.status(409).json({ message: "A user with that email already exists." });
        }
    } catch (error) {
        log.error({ err: error }, 'User email uniqueness check failed');
        return res.status(500).json({ message: "Error!" });
    }
    try {
        const created = await User.create({
            userCompId: companyId,
            userEmail: body.userEmail,
            userName: body.userName,
            userRole: role,
            userPasswordHash: hashPassword(body.password),
            userArch: false,
        });
        return res.status(201).json({ message: "User created.", user: safeView(created) });
    } catch (error) {
        log.error({ err: error }, 'User.create failed');
        return res.status(500).json({ message: "Error!" });
    }
}

exports.create = async (req, res) => {
    const body = req.body || {};

    // Signed-in USER (Bearer JWT): RBAC-enforced, creates in its OWN company.
    // canAssignRole requires the manage-roles permission AND no escalation —
    // so only an admin/owner can create users, and an admin cannot mint an
    // owner. Falls back to DEFAULT_ROLE when none is supplied.
    if (req.user) {
        const role = rbac.isRole(body.userRole) ? body.userRole : rbac.DEFAULT_ROLE;
        if (!rbac.canAssignRole(req.user.userRole, role)) {
            return res.status(403).json({ message: "Insufficient role to create a user with that role." });
        }
        if (body.userCompId !== undefined && Number(body.userCompId) !== req.user.userCompId) {
            return res.status(403).json({ message: "Cannot create a user for another company." });
        }
        return insertUser(res, req.user.userCompId, role, body);
    }

    // API-key path (the tenant's full-authority credential) — unchanged.
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

    let companyId;
    if (!isMaster) {
        try {
            companyId = await CompanyIdFromReq(req, authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (body.userCompId !== undefined && Number(body.userCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot create a user for a company you do not belong to." });
        }
    } else {
        companyId = Number(body.userCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify userCompId." });
        }
    }

    return insertUser(res, companyId, rbac.isRole(body.userRole) ? body.userRole : rbac.DEFAULT_ROLE, body);
};

/** GET /v1/user/:id — fetch one (metadata only). Secure-404 scoped. */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let user;
    try {
        user = await User.findByPk(req.params.id, { attributes: SAFE_ATTRS });
    } catch (error) {
        log.error({ err: error }, 'User.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!user || user.userArch) {
        return res.status(404).json({ message: "Not found." });
    }
    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || user.userCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    return res.status(200).json({ message: "Found.", user });
};

/** GET /v1/user/bycompany/:id — list a company's users (metadata only, paginated). */
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
        const { count, rows } = await User.findAndCountAll({
            where: { userCompId: targetCompanyId },
            attributes: SAFE_ATTRS,
            limit,
            offset,
            order: [['userId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, users: rows });
    } catch (error) {
        log.error({ err: error }, 'User.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** PATCH /v1/user/:id — update email / name / password. userCompId not settable here. */
exports.update = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const user = await findScoped(req, res);
    if (!user) return undefined;

    const body = req.body || {};
    const updates = {};
    if (body.userEmail !== undefined) updates.userEmail = body.userEmail;
    if (body.userName !== undefined) updates.userName = body.userName;
    if (body.password !== undefined) updates.userPasswordHash = hashPassword(body.password);
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }

    try {
        await user.update(updates);
        return res.status(200).json({ message: "Updated.", user: safeView(user) });
    } catch (error) {
        log.error({ err: error }, 'User.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/user/:id — soft-delete (sets userArch = true). */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const user = await findScoped(req, res);
    if (!user) return undefined;

    try {
        await user.update({ userArch: true });
        return res.status(200).json({ message: "Archived.", id: user.userId });
    } catch (error) {
        log.error({ err: error }, 'User archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * PATCH /v1/user/:id/role — set a user's RBAC role (#448). Company-scoped.
 * A signed-in USER (Bearer JWT) is subject to RBAC: it must hold the
 * manage-roles permission, and it can neither assign a role above its own
 * nor modify a user who currently out-ranks it (no privilege escalation).
 * An API key remains the tenant's full-authority credential (unchanged).
 */
exports.setRole = async (req, res) => {
    const body = req.body || {};
    if (!rbac.isRole(body.userRole)) {
        return res.status(400).json({ message: "Invalid role." });
    }
    const user = await findScoped(req, res);
    if (!user) return undefined;

    if (req.user && !rbac.canChangeRole(req.user.userRole, user.userRole, body.userRole)) {
        return res.status(403).json({ message: "Insufficient role to make this change." });
    }

    try {
        await user.update({ userRole: body.userRole });
        return res.status(200).json({ message: "Role updated.", user: safeView(user) });
    } catch (error) {
        log.error({ err: error }, 'User.setRole failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/user/:id/permissions — a user's role + effective permissions (#448). */
exports.permissions = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const user = await findScoped(req, res);
    if (!user) return undefined;

    return res.status(200).json({
        message: "Found.",
        userId: user.userId,
        userRole: user.userRole,
        permissions: rbac.permissionsFor(user.userRole),
    });
};
