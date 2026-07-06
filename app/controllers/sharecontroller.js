// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

// Shareable client-facing invoice links (#438). A tenant mints a signed,
// expiring token for one of their invoices; anyone holding the link can
// view a read-only projection of that invoice WITHOUT an API key. Tokens
// are HS256 JWTs (jwt.js) keyed by SHARE_SECRET — when it's unset, both
// endpoints return 503.

const crypto = require('crypto');
const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const jwt = require('../services/jwt.js');
const { resolveTtl, publicInvoiceView } = require('../services/share-link.js');

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;
const GetCompanyIdByCustomerId = auth.getCompanyIdByCustomerId;

function secret() {
    return process.env.SHARE_SECRET || '';
}

/** POST /v1/share/invoice/:id — mint a signed, expiring share link (tenant-scoped). */
exports.createInvoiceShare = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const s = secret();
    if (!s) {
        return res.status(503).json({ message: "Link sharing is not configured." });
    }

    let invoice;
    try {
        invoice = await db.Invoice.findByPk(req.params.id, { attributes: ['invId', 'invCustId', 'invArch'] });
    } catch (error) {
        log.error({ err: error }, 'share: Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || invCompanyId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const ttl = resolveTtl((req.body || {}).expiresInSec);
    // A per-link `jti` makes the token individually revocable (#4): revoking
    // records this jti in RevokedShareLink and the view rejects it.
    const jti = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign({ kind: 'invoice', id: invoice.invId, jti }, s, ttl);
    return res.status(201).json({
        message: "Share link created.",
        token,
        path: `/v1/share/invoice?token=${encodeURIComponent(token)}`,
        expiresIn: ttl,
    });
};

/**
 * POST /v1/share/revoke — revoke a previously-minted share link before its
 * `exp` (#4). The caller presents the token; we verify it, confirm the caller
 * owns the invoice it points at (secure-404), then deny-list its `jti`.
 * Idempotent: revoking an already-revoked link succeeds.
 */
exports.revokeInvoiceShare = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    const s = secret();
    if (!s) {
        return res.status(503).json({ message: "Link sharing is not configured." });
    }

    const payload = jwt.verify(String((req.body || {}).token || ''), s);
    if (!payload || payload.kind !== 'invoice' || !payload.id || !payload.jti) {
        // Invalid, already expired, or a legacy token minted without a jti
        // (those aren't individually revocable — rotate SHARE_SECRET instead).
        return res.status(400).json({ message: "Invalid, expired, or non-revocable link." });
    }

    let invoice;
    try {
        invoice = await db.Invoice.findByPk(payload.id, { attributes: ['invId', 'invCustId', 'invArch'] });
    } catch (error) {
        log.error({ err: error }, 'share revoke: Invoice.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
    const isMaster = await MasterFromReq(req, authKey);
    let companyId = invCompanyId;
    if (!isMaster) {
        companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || invCompanyId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await db.RevokedShareLink.findOrCreate({
            where: { rslJti: payload.jti },
            defaults: {
                rslJti: payload.jti,
                rslCompId: companyId,
                rslExpiresAt: new Date(payload.exp * 1000),
            },
        });
        return res.status(200).json({ message: "Share link revoked." });
    } catch (error) {
        log.error({ err: error }, 'share revoke: deny-list insert failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/** GET /v1/share/invoice?token=... — PUBLIC read-only invoice view. */
exports.viewInvoice = async (req, res) => {
    const s = secret();
    if (!s) {
        return res.status(503).json({ message: "Link sharing is not configured." });
    }

    const payload = jwt.verify(String(req.query.token || ''), s);
    if (!payload || payload.kind !== 'invoice' || !payload.id) {
        return res.status(401).json({ message: "Invalid or expired link." });
    }

    // Per-link revocation (#4): a deny-listed jti is dead even though the JWT
    // still verifies. Same 401 as an invalid token — don't leak revocation.
    if (payload.jti) {
        let revoked;
        try {
            revoked = await db.RevokedShareLink.findOne({ where: { rslJti: payload.jti }, attributes: ['rslId'] });
        } catch (error) {
            log.error({ err: error }, 'share: revocation check failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (revoked) {
            return res.status(401).json({ message: "Invalid or expired link." });
        }
    }

    let invoice;
    try {
        invoice = await db.Invoice.findByPk(payload.id, {
            include: [
                { model: db.Customer, as: 'customer', attributes: ['custId', 'custCompanyName', 'custFName', 'custLName'] },
                { model: db.CustomerPayment, as: 'payments', required: false },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'share: Invoice view load failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!invoice || invoice.invArch) {
        return res.status(404).json({ message: "Not found." });
    }

    return res.status(200).json({ message: "OK.", invoice: publicInvoiceView(invoice, invoice.payments) });
};
