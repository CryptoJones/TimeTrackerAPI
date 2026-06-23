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

/**
 * Resolve the hourly rate for a time entry: its explicit billing type
 * first, else the worker's default billing type. Returns null when no
 * rate can be resolved (the entry is "unrated" and won't be billed).
 *
 * Maps are id -> value: rateByBillTypeId (btId -> btHourlyRate) and
 * defaultBillTypeByWorkerId (workerId -> workerDefaultBillType id).
 */
function jobBillRate(entry, rateByBillTypeId, defaultBillTypeByWorkerId) {
    const bt = entry.teBillTypeId;
    if (bt != null && rateByBillTypeId.has(bt)) return rateByBillTypeId.get(bt);
    const w = entry.teWorkerId;
    if (w != null && defaultBillTypeByWorkerId.has(w)) {
        const dbt = defaultBillTypeByWorkerId.get(w);
        if (dbt != null && rateByBillTypeId.has(dbt)) return rateByBillTypeId.get(dbt);
    }
    return null;
}

/**
 * Compute the billable amount for a job from its time entries:
 * Σ (minutes/60 × rate), to the cent. Entries with no resolvable rate
 * are counted (unratedCount) but contribute nothing and are NOT marked
 * billed, so they can be invoiced later once a rate is set. Zero/null
 * minute entries are skipped silently.
 *
 * Returns { amount, billedEntryIds, unratedCount }.
 */
function computeJobBill(entries, rateByBillTypeId, defaultBillTypeByWorkerId) {
    let cents = 0;
    const billedEntryIds = [];
    let unratedCount = 0;
    for (const e of (entries || [])) {
        const mins = Number(e.teMinutes);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        const rate = jobBillRate(e, rateByBillTypeId, defaultBillTypeByWorkerId);
        if (rate == null) { unratedCount++; continue; }
        cents += Math.round((mins / 60) * Number(rate) * 100);
        billedEntryIds.push(e.teId);
    }
    return { amount: cents / 100, billedEntryIds, unratedCount };
}

// A/R aging buckets, keyed by days past the due date.
const AGING_KEYS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];

function emptyBuckets() {
    return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
}

/** Bucket key for a number of days past due (≤0 = not yet due → current). */
function agingBucketKey(daysPastDue) {
    if (!(daysPastDue > 0)) return 'current';
    if (daysPastDue <= 30) return 'd1_30';
    if (daysPastDue <= 60) return 'd31_60';
    if (daysPastDue <= 90) return 'd61_90';
    return 'd90_plus';
}

/** Whole days between an as-of date and a due date, both 'YYYY-MM-DD'. */
function daysPastDue(asOf, dueDate) {
    const ref = new Date(String(asOf) + 'T00:00:00Z').getTime();
    const due = new Date(String(dueDate) + 'T00:00:00Z').getTime();
    if (!Number.isFinite(ref) || !Number.isFinite(due)) return 0;
    return Math.floor((ref - due) / 86400000);
}

/**
 * Aggregate an A/R aging report from per-invoice items
 * ({ custId, customerName, invDueDate, balance }) as of a date. Only
 * positive balances count; each is placed in one bucket by how overdue
 * it is. Returns per-customer rows + grand totals.
 */
function computeAging(items, asOf) {
    const byCust = new Map();
    const totals = emptyBuckets();
    for (const it of (items || [])) {
        const bal = roundCents(it.balance);
        if (bal <= 0) continue;
        const key = agingBucketKey(daysPastDue(asOf, it.invDueDate));
        if (!byCust.has(it.custId)) {
            byCust.set(it.custId, Object.assign(
                { custId: it.custId, customerName: it.customerName }, emptyBuckets()));
        }
        const c = byCust.get(it.custId);
        c[key] = roundCents(c[key] + bal);
        c.total = roundCents(c.total + bal);
        totals[key] = roundCents(totals[key] + bal);
        totals.total = roundCents(totals.total + bal);
    }
    return { customers: [...byCust.values()], totals };
}

module.exports = {
    roundCents,
    sumField,
    invoiceTotal,
    invoicePaid,
    invoiceBalance,
    deriveStatus,
    summarize,
    jobBillRate,
    computeJobBill,
    AGING_KEYS,
    agingBucketKey,
    daysPastDue,
    computeAging,
};
