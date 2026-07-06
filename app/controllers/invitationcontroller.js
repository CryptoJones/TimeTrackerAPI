// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { hashPassword } = require('../services/password.js');
const { generateToken } = require('../services/password-reset.js');
const { sendMail } = require('../services/mailer.js');
const { isInviteValid, INVITE_TTL_SEC } = require('../services/invitation.js');
const rbac = require('../services/rbac.js');
const Invitation = db.Invitation;

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

// invtTokenHash is write-only.
const SAFE_ATTRS = ['invtId', 'invtCompId', 'invtEmail', 'invtRole', 'invtExpires', 'invtAcceptedAt', 'invtArch', 'createdAt', 'updatedAt'];

function safeView(i) {
    return {
        invtId: i.invtId, invtCompId: i.invtCompId, invtEmail: i.invtEmail,
        invtRole: i.invtRole, invtExpires: i.invtExpires, invtAcceptedAt: i.invtAcceptedAt, invtArch: i.invtArch,
    };
}

/** Shared tail: reject a duplicate active user, mint the invite, email the token. */
async function insertInvitation(res, companyId, body) {
    try {
        const existing = await db.User.findOne({ where: { userCompId: companyId, userEmail: body.invtEmail } });
        if (existing) {
            return res.status(409).json({ message: "A user with that email already exists." });
        }
    } catch (error) {
        log.error({ err: error }, 'invitation: user uniqueness check failed');
        return res.status(500).json({ message: "Error!" });
    }

    const token = generateToken();
    const expires = new Date(Date.now() + INVITE_TTL_SEC * 1000);
    let created;
    try {
        created = await Invitation.create({
            invtCompId: companyId,
            invtEmail: body.invtEmail,
            invtRole: body.invtRole,
            invtTokenHash: auth.hashKey(token),
            invtExpires: expires,
            invtAcceptedAt: null,
            invtArch: false,
        });
    } catch (error) {
        log.error({ err: error }, 'Invitation.create failed');
        return res.status(500).json({ message: "Error!" });
    }

    try {
        await sendMail({
            to: body.invtEmail,
            subject: 'You have been invited',
            text: `You've been invited to join a workspace as "${body.invtRole}". Accept with this token (valid 7 days):\n\n${token}`,
        });
    } catch (error) {
        // The invite exists; a mail failure shouldn't 500 the caller.
        log.error({ err: error }, 'invitation: sendMail failed');
    }

    return res.status(201).json({ message: "Invitation sent.", invitation: safeView(created) });
}

/** POST /v1/invitation — invite an email to join a company with a role. */
exports.create = async (req, res) => {
    const body = req.body || {};

    // Signed-in USER (Bearer JWT): RBAC-enforced; invites into its OWN
    // company and only with a role it may assign (no privilege escalation).
    if (req.user) {
        if (!rbac.isRole(body.invtRole) || !rbac.canAssignRole(req.user.userRole, body.invtRole)) {
            return res.status(403).json({ message: "Insufficient role to invite with that role." });
        }
        if (body.invtCompId !== undefined && Number(body.invtCompId) !== req.user.userCompId) {
            return res.status(403).json({ message: "Cannot invite to another company." });
        }
        return insertInvitation(res, req.user.userCompId, body);
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
        if (body.invtCompId !== undefined && Number(body.invtCompId) !== companyId) {
            return res.status(403).json({ message: "Cannot invite to a company you do not belong to." });
        }
    } else {
        companyId = Number(body.invtCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify invtCompId." });
        }
    }

    return insertInvitation(res, companyId, body);
};

/**
 * POST /v1/invitation/accept — PUBLIC. Provision a user from a valid,
 * unexpired, unaccepted invitation token.
 */
exports.accept = async (req, res) => {
    const body = req.body || {};
    const tokenHash = auth.hashKey(body.token || '');

    let invite;
    try {
        invite = await Invitation.findOne({ where: { invtTokenHash: tokenHash } });
    } catch (error) {
        log.error({ err: error }, 'invitation accept: findOne failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!isInviteValid(invite, tokenHash, Date.now())) {
        return res.status(400).json({ message: "Invalid or expired invitation." });
    }

    // Guard against a user having been created for that email meanwhile.
    try {
        const existing = await db.User.findOne({ where: { userCompId: invite.invtCompId, userEmail: invite.invtEmail } });
        if (existing) {
            return res.status(409).json({ message: "A user with that email already exists." });
        }
    } catch (error) {
        log.error({ err: error }, 'invitation accept: user uniqueness check failed');
        return res.status(500).json({ message: "Error!" });
    }

    let user;
    try {
        user = await db.User.create({
            userCompId: invite.invtCompId,
            userEmail: invite.invtEmail,
            userName: body.userName,
            userRole: invite.invtRole,
            userPasswordHash: hashPassword(body.password),
            userArch: false,
        });
        await invite.update({ invtAcceptedAt: new Date() });
    } catch (error) {
        log.error({ err: error }, 'invitation accept: provisioning failed');
        return res.status(500).json({ message: "Error!" });
    }

    return res.status(201).json({
        message: "Invitation accepted.",
        user: { userId: user.userId, userCompId: user.userCompId, userEmail: user.userEmail, userName: user.userName, userRole: user.userRole },
    });
};

/** GET /v1/invitation/bycompany/:id — list a company's invitations (no token hash). */
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
        const { count, rows } = await Invitation.findAndCountAll({
            where: { invtCompId: targetCompanyId },
            attributes: SAFE_ATTRS,
            limit,
            offset,
            order: [['invtId', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({ message: "Found.", count, limit, offset, invitations: rows });
    } catch (error) {
        log.error({ err: error }, 'Invitation.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** DELETE /v1/invitation/:id — revoke (soft-delete). Company-scoped, secure-404. */
exports.remove = async (req, res) => {
    if (!req.get('authKey')) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let invite;
    try {
        invite = await Invitation.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'Invitation.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invite || invite.invtArch) {
        return res.status(404).json({ message: "Not found." });
    }
    const isMaster = await MasterFromReq(req, req.get('authKey'));
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, req.get('authKey'));
        if (companyId === -1 || invite.invtCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await invite.update({ invtArch: true });
        return res.status(200).json({ message: "Revoked.", id: invite.invtId });
    } catch (error) {
        log.error({ err: error }, 'Invitation revoke failed');
        return res.status(500).json({ message: "Error!" });
    }
};
