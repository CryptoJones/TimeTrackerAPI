// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * payroll.js — aggregate completed time entries into per-worker hours for
 * a pay period (#456). PURE: no DB, no I/O. Given entries (teWorkerId,
 * teMinutes, teBillable) and workers (name + workerCostRate), produce one
 * row per worker who logged time: total/billable/non-billable hours and a
 * labor-cost total (hours × cost rate, exact money). Consumed by the CSV
 * and JSON payroll endpoints.
 */

const money = require('./money.js');

/** Minutes → hours, rounded to 2 decimals. */
function hoursFromMinutes(min) {
    return Math.round((Number(min || 0) / 60) * 100) / 100;
}

/**
 * @param entries array of { teWorkerId, teMinutes, teBillable }.
 * @param workers array of { workerId, workerFName, workerLName, workerCostRate }.
 * @param opts { from, to } — echoed into the result as the period bounds.
 */
function buildPayroll(entries, workers, opts = {}) {
    const wmap = new Map();
    for (const w of workers || []) wmap.set(w.workerId, w);

    const byId = new Map();
    for (const e of entries || []) {
        const wid = e.teWorkerId;
        if (wid == null) continue;
        if (!byId.has(wid)) byId.set(wid, { workerId: wid, totalMinutes: 0, billableMinutes: 0, nonBillableMinutes: 0 });
        const agg = byId.get(wid);
        const m = Number(e.teMinutes) || 0;
        agg.totalMinutes += m;
        if (e.teBillable) agg.billableMinutes += m;
        else agg.nonBillableMinutes += m;
    }

    const rows = [];
    let totalMinutes = 0;
    let costTotal = 0;
    for (const agg of byId.values()) {
        const w = wmap.get(agg.workerId);
        const name = w ? [w.workerFName, w.workerLName].filter(Boolean).join(' ') || null : null;
        const costRate = (w && w.workerCostRate != null) ? Number(w.workerCostRate) : null;
        const totalHours = hoursFromMinutes(agg.totalMinutes);
        // Labor cost is rate × exact minutes/60, rounded ONCE — NOT rate ×
        // the 2-dp display hours. Pre-rounding the hours first injects up to
        // 0.005×rate of error per worker (e.g. 50 min @ $100/hr: the display
        // 0.83 h × 100 = 83.00, but the correct 100 × 50/60 = 83.33).
        // Mirrors the rate × teMinutes/60 calc in rate.js.
        const rowCost = costRate != null ? money.multiply(costRate, agg.totalMinutes / 60) : null;
        rows.push({
            workerId: agg.workerId,
            workerName: name,
            totalMinutes: agg.totalMinutes,
            totalHours,
            billableHours: hoursFromMinutes(agg.billableMinutes),
            nonBillableHours: hoursFromMinutes(agg.nonBillableMinutes),
            costRate,
            costTotal: rowCost,
        });
        totalMinutes += agg.totalMinutes;
        if (rowCost != null) costTotal = money.add(costTotal, rowCost);
    }
    rows.sort((a, b) => a.workerId - b.workerId);

    return {
        periodStart: opts.from || null,
        periodEnd: opts.to || null,
        rows,
        totals: {
            workers: rows.length,
            totalMinutes,
            totalHours: hoursFromMinutes(totalMinutes),
            costTotal,
        },
    };
}

module.exports = { buildPayroll, hoursFromMinutes };
