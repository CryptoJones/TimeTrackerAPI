// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Human-account auth for the web app: email + password signup/login.
 *
 * A successful signup/login returns a freshly-minted company API key
 * (the raw value, shown once) that the web app then sends as the
 * `authKey` header on every other /v1 call — so the existing
 * company-scoped authorization works unchanged, no per-controller
 * rewrite. The key is the session credential; logout archives it.
 *
 * (A stateless JWT + a unified auth gate is a future hardening; this
 * keeps the web app working today on the existing authKey mechanism.)
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');

const BCRYPT_ROUNDS = 10;
// A fixed bcrypt hash compared against on unknown-email login so the
// response time doesn't reveal whether the email exists.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8oQ4z6mY6Qe3sQp6sQp6sQp6sQp6S';

/** Mint a company API key, store its hash, return the raw token once. */
async function provisionApiKey(companyId, transaction) {
    const raw = crypto.randomBytes(32).toString('hex');
    await db.ApiKey.create({
        akKEY: auth.hashKey(raw),
        akCompanyId: companyId,
        akArchive: false,
        // akArchiveDate is NOT NULL in the schema; sentinel for an active key.
        akArchiveDate: '2000-01-01T00:00:00Z',
    }, { transaction });
    return raw;
}

/**
 * POST /v1/auth/signup — create a user + their workspace (Company) and
 * return a session API key.
 */
exports.signup = async (req, res) => {
    const { email, password, companyName } = req.body || {};

    let existing;
    try {
        existing = await db.User.unscoped().findOne({ where: { usrEmail: email } });
    } catch (error) {
        log.error({ err: error }, 'auth.signup lookup failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (existing) {
        return res.status(409).json({ message: "Email already registered." });
    }

    const t = await db.sequelize.transaction();
    try {
        const company = await db.Company.create(
            { compName: companyName || email, compArch: false }, { transaction: t });
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await db.User.create({
            usrEmail: email, usrPasswordHash: passwordHash,
            usrCompId: company.compId, usrArch: false,
        }, { transaction: t });
        const apiKey = await provisionApiKey(company.compId, t);
        await t.commit();
        return res.status(201).json({
            message: "Account created.",
            user: { id: user.usrId, email: user.usrEmail, companyId: company.compId },
            apiKey,
        });
    } catch (error) {
        await t.rollback().catch(() => {});
        // A racing duplicate signup trips the unique-email constraint.
        if (error && error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "Email already registered." });
        }
        log.error({ err: error }, 'auth.signup failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/auth/login — verify credentials, mint a fresh session API key.
 */
exports.login = async (req, res) => {
    const { email, password } = req.body || {};

    let user;
    try {
        user = await db.User.findOne({ where: { usrEmail: email } });
    } catch (error) {
        log.error({ err: error }, 'auth.login lookup failed');
        return res.status(500).json({ message: "Error!" });
    }

    // Constant-ish time: always run a bcrypt compare, even on unknown
    // email, so timing doesn't leak account existence.
    const ok = await bcrypt.compare(password, user ? user.usrPasswordHash : DUMMY_HASH);
    if (!user || !ok) {
        return res.status(401).json({ message: "Invalid email or password." });
    }

    const t = await db.sequelize.transaction();
    try {
        const apiKey = await provisionApiKey(user.usrCompId, t);
        await t.commit();
        return res.status(200).json({
            message: "Logged in.",
            user: { id: user.usrId, email: user.usrEmail, companyId: user.usrCompId },
            apiKey,
        });
    } catch (error) {
        await t.rollback().catch(() => {});
        log.error({ err: error }, 'auth.login mint failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/auth/logout — archive the session API key in the authKey
 * header so it can no longer authenticate.
 */
exports.logout = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    try {
        await db.ApiKey.update(
            { akArchive: true },
            { where: { akKEY: auth.hashKey(authKey) } });
        return res.status(200).json({ message: "Logged out." });
    } catch (error) {
        log.error({ err: error }, 'auth.logout failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/auth/me — resolve the session key to its user + workspace.
 */
exports.me = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    let companyId;
    try {
        companyId = await auth.getCompanyId(authKey);
    } catch (error) {
        log.error({ err: error }, 'auth.me getCompanyId failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (companyId === -1) {
        return res.status(404).json({ message: "No user for this key." });
    }
    try {
        const user = await db.User.findOne({
            where: { usrCompId: companyId },
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        if (!user) {
            return res.status(404).json({ message: "No user for this key." });
        }
        return res.status(200).json({
            message: "OK.",
            user: {
                id: user.usrId, email: user.usrEmail, companyId,
                companyName: user.company && user.company.compName,
            },
        });
    } catch (error) {
        log.error({ err: error }, 'auth.me failed');
        return res.status(500).json({ message: "Error!" });
    }
};

exports._internals = { provisionApiKey, DUMMY_HASH };
