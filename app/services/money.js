// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Money math for invoicing. Centralized so every amount calculation
 * rounds the same way and float drift can't accumulate across the
 * codebase.
 *
 * The amount columns are stored as DOUBLE today (a known latent issue
 * tracked in PRODUCT-BACKLOG.md — money should ultimately live in
 * numeric/decimal). Until that migration, every total/balance is forced
 * back to 2-decimal precision here at the boundary so partial-payment
 * arithmetic stays exact to the cent.
 */

/** Round a number to 2 decimals (cents), guarding NaN/Infinity to 0. */
function roundCents(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    // Scale-round-unscale; the +Number.EPSILON nudge avoids the classic
    // 1.005 → 1.00 float-floor surprise.
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Sum a list of {field}-bearing rows to cents precision. */
function sumField(rows, field) {
    if (!Array.isArray(rows)) return 0;
    let cents = 0;
    for (const r of rows) {
        cents += Math.round((Number(r && r[field]) + Number.EPSILON) * 100) || 0;
    }
    return cents / 100;
}

/** Total of an invoice's line items (InvoiceJob.injbAmount). */
function invoiceTotal(lines) {
    return roundCents(sumField(lines, 'injbAmount'));
}

/** Total recorded against an invoice (CustomerPayment.cpayAmount). */
function invoicePaid(payments) {
    return roundCents(sumField(payments, 'cpayAmount'));
}

/** Outstanding balance = total − paid (never returns -0). */
function invoiceBalance(total, paid) {
    const b = roundCents(roundCents(total) - roundCents(paid));
    return b === 0 ? 0 : b;
}

/**
 * Derive the payment-state status from the money, preserving manual
 * lifecycle states. A 'void' invoice stays void. Otherwise:
 *   - fully covered (paid ≥ total, total > 0)  → 'paid'
 *   - some money in (0 < paid < total)         → 'partial'
 *   - nothing paid                             → keep the current
 *     lifecycle state ('draft' / 'sent')
 *
 * This lets recording a payment move draft/sent → partial/paid without
 * clobbering the draft↔sent transition, which is a manual ("send the
 * invoice") action, not a money-derived one.
 */
function deriveStatus({ total, paid, currentStatus }) {
    if (currentStatus === 'void') return 'void';
    const t = roundCents(total);
    const p = roundCents(paid);
    if (t > 0 && p >= t) return 'paid';
    if (p > 0) return 'partial';
    return currentStatus || 'draft';
}

/**
 * Build the money summary for an invoice given its lines + payments and
 * its stored status. Returned shape is what the API surfaces.
 */
function summarize(invoice, lines, payments) {
    const total = invoiceTotal(lines);
    const paid = invoicePaid(payments);
    const balance = invoiceBalance(total, paid);
    const status = deriveStatus({
        total,
        paid,
        currentStatus: invoice && invoice.invStatus,
    });
    return { total, paid, balance, status };
}

module.exports = {
    roundCents,
    sumField,
    invoiceTotal,
    invoicePaid,
    invoiceBalance,
    deriveStatus,
    summarize,
};
