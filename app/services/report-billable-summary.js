// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-billable-summary.js — billable vs non-billable time, split by
 * month, with the overall billable ratio (#432). The utilization view:
 * how much of the tracked time is actually billable, trending over time.
 *
 * PURE: the caller loads closed time entries (with their rate
 * associations); this buckets minutes billable/non-billable per month,
 * prices the billable minutes via rate.js, and sums exactly via money.js.
 * No DB.
 */

const money = require('./money.js');
const rate = require('./rate.js');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 'YYYY-MM' month from a Date or ISO string, else 'unknown'. */
function periodOf(startedAt) {
    if (!startedAt) return 'unknown';
    let s;
    if (typeof startedAt === 'string') s = startedAt;
    else if (startedAt instanceof Date) s = startedAt.toISOString();
    else s = String(startedAt);
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : 'unknown';
}

/**
 * @param entries closed time entries with { teId, teMinutes, teBillable,
 *   teStartedAt } and eager-loaded rate associations. In-flight entries
 *   (teMinutes null) are skipped.
 * @returns totals + billableRatio + per-month periods.
 */
function buildBillableSummary(entries) {
    const map = new Map();
    const allAmounts = [];
    const unresolvedRate = [];
    let totalBillableMin = 0;
    let totalNonBillableMin = 0;

    for (const e of entries || []) {
        if (e.teMinutes == null) continue;
        const m = Number(e.teMinutes) || 0;
        const p = periodOf(e.teStartedAt);
        let g = map.get(p);
        if (!g) { g = { period: p, billableMinutes: 0, nonBillableMinutes: 0, amounts: [] }; map.set(p, g); }
        if (e.teBillable) {
            g.billableMinutes += m;
            totalBillableMin += m;
            const amt = rate.billableAmount(e);
            if (amt == null) unresolvedRate.push(e.teId);
            else { g.amounts.push(amt); allAmounts.push(amt); }
        } else {
            g.nonBillableMinutes += m;
            totalNonBillableMin += m;
        }
    }

    const periods = Array.from(map.values()).map((g) => ({
        period: g.period,
        billableMinutes: g.billableMinutes,
        nonBillableMinutes: g.nonBillableMinutes,
        billableHours: round2(g.billableMinutes / 60),
        nonBillableHours: round2(g.nonBillableMinutes / 60),
        billableAmount: money.sum(g.amounts),
    })).sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));

    const totalMin = totalBillableMin + totalNonBillableMin;
    return {
        periods,
        totalBillableMinutes: totalBillableMin,
        totalNonBillableMinutes: totalNonBillableMin,
        totalBillableHours: round2(totalBillableMin / 60),
        totalNonBillableHours: round2(totalNonBillableMin / 60),
        billableRatio: totalMin > 0 ? round2(totalBillableMin / totalMin) : 0,
        totalBillableAmount: money.sum(allAmounts),
        unresolvedRateEntries: unresolvedRate.length,
    };
}

module.exports = { buildBillableSummary, periodOf };
