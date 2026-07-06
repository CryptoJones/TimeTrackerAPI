// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-utilization.js — worker utilization (#53): how much of each
 * worker's capacity is billable. Two ratios per worker:
 *   - utilization  = billable minutes / capacity minutes
 *     (capacity = workerTargetMinsPerWeek × weeks in the range)
 *   - billableRatio = billable minutes / total logged minutes
 * plus team-wide totals.
 *
 * PURE: the caller loads workers (with a weekly target + summed billable
 * and total minutes) and the week count. No DB. Hours-based, not money.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param workers array of { workerId, workerName, targetMinsPerWeek,
 *   billableMins, totalMins }.
 * @param weeks number of weeks the weekly target applies over.
 * @returns { weeks, workers: [...rows], count, totals }.
 */
function buildUtilization(workers, weeks) {
    const w = Math.max(1, Math.round(Number(weeks) || 1));
    let teamBillable = 0;
    let teamTotal = 0;
    let teamCapacity = 0;

    const rows = (workers || []).map((x) => {
        const perWeek = x.targetMinsPerWeek == null ? null : Number(x.targetMinsPerWeek);
        const capacityMins = perWeek == null ? null : perWeek * w;
        const billableMins = Number(x.billableMins) || 0;
        const totalMins = Number(x.totalMins) || 0;

        teamBillable += billableMins;
        teamTotal += totalMins;
        if (capacityMins != null) teamCapacity += capacityMins;

        const utilization = (capacityMins == null || capacityMins <= 0) ? null : billableMins / capacityMins;
        const billableRatio = totalMins > 0 ? billableMins / totalMins : null;
        return {
            workerId: x.workerId,
            workerName: x.workerName || null,
            capacityMinutes: capacityMins,
            capacityHours: capacityMins == null ? null : round2(capacityMins / 60),
            billableMinutes: billableMins,
            billableHours: round2(billableMins / 60),
            totalMinutes: totalMins,
            totalHours: round2(totalMins / 60),
            utilizationPct: utilization == null ? null : round2(utilization * 100),
            billableRatioPct: billableRatio == null ? null : round2(billableRatio * 100),
        };
    }).sort((a, b) => a.workerId - b.workerId);

    return {
        weeks: w,
        workers: rows,
        count: rows.length,
        totals: {
            capacityMinutes: teamCapacity,
            billableMinutes: teamBillable,
            totalMinutes: teamTotal,
            utilizationPct: teamCapacity > 0 ? round2((teamBillable / teamCapacity) * 100) : null,
            billableRatioPct: teamTotal > 0 ? round2((teamBillable / teamTotal) * 100) : null,
        },
    };
}

module.exports = { buildUtilization };
