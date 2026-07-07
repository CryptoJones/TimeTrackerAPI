// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * invoice-tax.js — sales-tax computation for invoices (#420).
 *
 * A tax rate is a fraction (0.0725 = 7.25%). The effective rate for an
 * invoice is: an explicit per-invoice override → the company's default
 * (compTaxRate) → 0. Tax is the subtotal times the rate, rounded to the
 * cent through money.js so the printed tax + total never drift.
 *
 * PURE: no DB.
 */

const money = require('./money.js');

/** Coerce a tax rate to a sane fraction in [0, 1]. Bad input → 0. */
function normalizeRate(rate) {
    const n = typeof rate === 'string' ? Number(rate) : rate;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0;
    return n > 1 ? 1 : n;
}

/** tax = subtotal × rate, rounded to the cent. */
function computeTax(subtotal, rate) {
    return money.multiply(subtotal == null ? 0 : subtotal, normalizeRate(rate));
}

/**
 * The effective rate for an invoice: explicit override first, else the
 * company default, else 0. Any of the inputs may be null/undefined.
 */
function resolveRate({ override, companyDefault }) {
    if (override != null) return normalizeRate(override);
    if (companyDefault != null) return normalizeRate(companyDefault);
    return 0;
}

/**
 * Compose an invoice's discount / tax / total from a subtotal, a raw discount
 * request, and a resolved tax rate. The ORDER OF OPERATIONS is the invariant
 * this pins (it's what makes the numbers right, and is easy to get wrong):
 *
 *   1. discount is clamped to [0, subtotal]  (a bad/negative one → 0; one
 *      larger than the subtotal → the subtotal, so total never goes negative);
 *   2. tax is computed on the POST-discount taxable base — NOT the raw
 *      subtotal — so a discount reduces the tax too;
 *   3. total = taxableBase + tax.
 *
 * Write-off is deliberately NOT part of the total: it settles the outstanding
 * balance like a payment (see invoice-status.js), it doesn't reduce the bill.
 *
 * PURE. @returns { discount, taxableBase, tax, total } — all cent-rounded.
 */
function composeTotals(subtotal, rawDiscount, taxRate) {
    const sub = subtotal == null ? 0 : subtotal;
    let discount = Number(rawDiscount);
    if (!Number.isFinite(discount) || discount < 0) discount = 0;
    if (money.subtract(sub, discount) < 0) discount = sub;
    discount = money.round(discount);
    const taxableBase = money.subtract(sub, discount);
    const tax = computeTax(taxableBase, taxRate);
    const total = money.add(taxableBase, tax);
    return { discount, taxableBase, tax, total };
}

module.exports = { normalizeRate, computeTax, resolveRate, composeTotals };
