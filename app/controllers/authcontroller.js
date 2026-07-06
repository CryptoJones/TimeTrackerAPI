// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

// User sign-in (#445): POST /v1/login issues a short-lived HS256 JWT for
// a User (#444); GET /v1/me returns the signed-in user. This is a SECOND,
// optional auth path — the existing API-key auth is unchanged. Signing
// requires the JWT_SECRET env var; when it's unset, sign-in returns 503.

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const jwt = require('../services/jwt.js');
const { verifyPassword } = require('../services/password.js');

const TOKEN_TTL_SEC = 12 * 60 * 60; // 12 hours

function secret() {
    return process.env.JWT_SECRET || '';
}

function safeUser(u) {
    return { userId: u.userId, userCompId: u.userCompId, userEmail: u.userEmail, userName: u.userName };
}

/** POST /v1/login — verify email + password (within a company), issue a JWT. */
exports.login = async (req, res) => {
    const s = secret();
    if (!s) {
        return res.status(503).json({ message: "Sign-in is not configured." });
    }

    const body = req.body || {};
    const companyId = Number(body.companyId);

    let user;
    try {
        user = await db.User.findOne({ where: { userEmail: body.userEmail, userCompId: companyId } });
    } catch (error) {
        log.error({ err: error }, 'login: User.findOne failed');
        return res.status(500).json({ message: "Error!" });
    }

    // Generic 401 — never reveal whether the email exists (anti-enumeration).
    if (!user || user.userArch || !verifyPassword(body.password, user.userPasswordHash)) {
        return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign({ sub: user.userId, userCompId: user.userCompId }, s, TOKEN_TTL_SEC);
    return res.status(200).json({
        message: "Signed in.",
        token,
        tokenType: "Bearer",
        expiresIn: TOKEN_TTL_SEC,
        user: safeUser(user),
    });
};

/** GET /v1/me — return the user for a valid Bearer token. */
exports.me = async (req, res) => {
    const s = secret();
    if (!s) {
        return res.status(503).json({ message: "Sign-in is not configured." });
    }

    const authz = req.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(authz);
    if (!m) {
        return res.status(401).json({ message: "Bearer token required." });
    }
    const payload = jwt.verify(m[1], s);
    if (!payload || !payload.sub) {
        return res.status(401).json({ message: "Invalid or expired token." });
    }

    let user;
    try {
        user = await db.User.findByPk(payload.sub, { attributes: ['userId', 'userCompId', 'userEmail', 'userName', 'userArch'] });
    } catch (error) {
        log.error({ err: error }, 'me: User.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!user || user.userArch) {
        return res.status(401).json({ message: "Invalid or expired token." });
    }
    return res.status(200).json({ message: "OK.", user: safeUser(user) });
};
