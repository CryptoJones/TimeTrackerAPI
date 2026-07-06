// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * share-link.js — shareable client-facing invoice links (#438). The token
 * itself is a signed HS256 JWT (jwt.js) keyed by SHARE_SECRET; this module
 * holds the TTL policy and the PURE read-only public projection of an
 * invoice (no internal-only fields, no cross-tenant data). money via
 * money.js.
 */

const money = require('./money.js');

const SHARE_TTL_DEFAULT_SEC = 7 * 24 * 60 * 60; // 7 days
const SHARE_TTL_MAX_SEC = 90 * 24 * 60 * 60;    // 90 days
const SHARE_TTL_MIN_SEC = 60;

/** Clamp a requested TTL into [MIN, MAX], defaulting when absent/invalid. */
function resolveTtl(requested) {
    const n = Number(requested);
    if (!Number.isFinite(n) || n <= 0) return SHARE_TTL_DEFAULT_SEC;
    return Math.min(Math.max(Math.floor(n), SHARE_TTL_MIN_SEC), SHARE_TTL_MAX_SEC);
}

/** The read-only, client-safe view of an invoice (+ its payments). */
function publicInvoiceView(invoice, payments) {
    const inv = invoice || {};
    const collected = money.sum((payments || []).map((p) => p.cpayAmount));
    const total = inv.invTotal == null ? 0 : Number(inv.invTotal);
    const balance = money.subtract(total, collected);
    const c = inv.customer;
    return {
        invId: inv.invId,
        invNumber: inv.invNumber,
        invDate: inv.invDate,
        invDueDate: inv.invDueDate,
        invCurrency: inv.invCurrency,
        invSubtotal: inv.invSubtotal,
        invTax: inv.invTax,
        invDiscount: inv.invDiscount,
        invWriteOff: inv.invWriteOff,
        invTotal: inv.invTotal,
        invPaid: inv.invPaid,
        collected,
        balance,
        customer: c ? { name: c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ') || null } : null,
    };
}

module.exports = {
    SHARE_TTL_DEFAULT_SEC,
    SHARE_TTL_MAX_SEC,
    SHARE_TTL_MIN_SEC,
    resolveTtl,
    publicInvoiceView,
};
