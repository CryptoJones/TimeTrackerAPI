// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-budget.js — project budget vs actuals (#434). For each budgeted
 * job, compares logged hours against jobBudgetMinutes and billable value
 * against jobBudgetAmount, flagging each dimension under / near / over.
 *
 * PURE: the caller loads the budgeted jobs with their actuals already
 * summed. "near" fires at ≥ 80% of budget, "over" past 100%.
 */

const money = require('./money.js');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const NEAR_THRESHOLD = 0.8;

/** ratio actual/budget, or null when there's no positive budget. */
function ratioOf(actual, budget) {
    if (budget == null || Number(budget) <= 0) return null;
    return Number(actual || 0) / Number(budget);
}

/** under / near / over from a ratio; 'no-budget' when the ratio is null. */
function statusOf(ratio) {
    if (ratio == null) return 'no-budget';
    if (ratio > 1) return 'over';
    if (ratio >= NEAR_THRESHOLD) return 'near';
    return 'under';
}

/**
 * @param jobs array of { jobId, jobDesc, budgetMinutes, budgetAmount,
 *   actualMinutes, actualAmount }.
 * @returns { jobs: [...per-job budget rows], count, overCount }.
 */
function buildBudget(jobs) {
    const rows = (jobs || []).map((j) => {
        const bMin = j.budgetMinutes == null ? null : Number(j.budgetMinutes);
        const bAmt = j.budgetAmount == null ? null : Number(j.budgetAmount);
        const aMin = Number(j.actualMinutes) || 0;
        const aAmt = money.round(Number(j.actualAmount) || 0);
        const hoursRatio = ratioOf(aMin, bMin);
        const amountRatio = ratioOf(aAmt, bAmt);
        return {
            jobId: j.jobId,
            jobDesc: j.jobDesc || null,
            budgetMinutes: bMin,
            budgetHours: bMin == null ? null : round2(bMin / 60),
            actualMinutes: aMin,
            actualHours: round2(aMin / 60),
            hoursRatio: hoursRatio == null ? null : round2(hoursRatio),
            hoursStatus: statusOf(hoursRatio),
            budgetAmount: bAmt,
            actualAmount: aAmt,
            amountRatio: amountRatio == null ? null : round2(amountRatio),
            amountStatus: statusOf(amountRatio),
        };
    }).sort((a, b) => a.jobId - b.jobId);

    const overCount = rows.filter((r) => r.hoursStatus === 'over' || r.amountStatus === 'over').length;
    return { jobs: rows, count: rows.length, overCount };
}

module.exports = { buildBudget, ratioOf, statusOf };
