// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

// Shareable client-facing invoice links (#438). A tenant mints a signed,
// expiring token for one of their invoices; anyone holding the link can
// view a read-only projection of that invoice WITHOUT an API key. Tokens
// are HS256 JWTs (jwt.js) keyed by SHARE_SECRET — when it's unset, both
// endpoints return 503.

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const jwt = require('../services/jwt.js');
const { resolveTtl, publicInvoiceView } = require('../services/share-link.js');

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
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

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const invCompanyId = await GetCompanyIdByCustomerId(invoice.invCustId);
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || invCompanyId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const ttl = resolveTtl((req.body || {}).expiresInSec);
    const token = jwt.sign({ kind: 'invoice', id: invoice.invId }, s, ttl);
    return res.status(201).json({
        message: "Share link created.",
        token,
        path: `/v1/share/invoice?token=${encodeURIComponent(token)}`,
        expiresIn: ttl,
    });
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
