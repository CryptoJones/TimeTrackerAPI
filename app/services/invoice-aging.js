// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * invoice-aging.js — accounts-receivable aging (#40).
 *
 * Buckets outstanding invoice balances by how overdue they are:
 *   current  — not yet due (or due today)
 *   d1_30    — 1–30 days overdue
 *   d31_60   — 31–60 days overdue
 *   d61_90   — 61–90 days overdue
 *   d90plus  — more than 90 days overdue
 *
 * PURE: the caller resolves each invoice's outstanding balance (via
 * invoice-status.summarize) and passes plain items; this does date math
 * and exact-money bucketing. No DB.
 */

const money = require('./money.js');

const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'];

/** Whole days from dueDate to today (positive = overdue). Both 'YYYY-MM-DD'. */
function daysOverdue(dueDate, today) {
    const due = Date.parse(dueDate + 'T00:00:00Z');
    const now = Date.parse(today + 'T00:00:00Z');
    if (!Number.isFinite(due) || !Number.isFinite(now)) return 0;
    return Math.round((now - due) / 86400000);
}

function bucketFor(days) {
    if (days <= 0) return 'current';
    if (days <= 30) return 'd1_30';
    if (days <= 60) return 'd31_60';
    if (days <= 90) return 'd61_90';
    return 'd90plus';
}

/**
 * @param items array of { invId, invNumber, custName, dueDate, balance }.
 *   Items with a null / non-positive balance (settled or credit) are
 *   skipped — an aging report is about what's still owed.
 * @param today 'YYYY-MM-DD'
 * @returns { buckets, totalOutstanding, invoices }
 *   buckets[name] = { count, amount }; invoices carry their bucket + daysOverdue.
 */
function buildAging(items, today) {
    const amounts = {};
    const counts = {};
    for (const b of BUCKETS) { amounts[b] = []; counts[b] = 0; }
    const invoices = [];

    for (const it of items || []) {
        if (it.balance == null || it.balance <= 0) continue;
        const days = daysOverdue(it.dueDate, today);
        const bucket = bucketFor(days);
        counts[bucket] += 1;
        amounts[bucket].push(it.balance);
        invoices.push({
            invId: it.invId,
            invNumber: it.invNumber,
            custName: it.custName,
            dueDate: it.dueDate,
            balance: it.balance,
            daysOverdue: days,
            bucket,
        });
    }

    const buckets = {};
    for (const b of BUCKETS) buckets[b] = { count: counts[b], amount: money.sum(amounts[b]) };
    const totalOutstanding = money.sum(BUCKETS.map((b) => buckets[b].amount));
    // Most overdue first, then by due date.
    invoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return { buckets, totalOutstanding, invoices };
}

module.exports = { buildAging, daysOverdue, bucketFor, BUCKETS };
