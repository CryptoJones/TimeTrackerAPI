// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-hours.js — hours summary grouped by customer, job, and worker
 * (#431), each with its billable / non-billable split.
 *
 * PURE: the caller loads closed time entries (with customer/job/worker
 * names) and this aggregates minutes in memory. No DB, no rate lookup —
 * this is an hours report, not a money report.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function addTo(map, key, label, minutes, billable) {
    if (key == null) return; // entries with no job/worker don't appear in that dimension
    let g = map.get(key);
    if (!g) { g = { key, label: label || null, minutes: 0, billableMinutes: 0 }; map.set(key, g); }
    g.minutes += minutes;
    if (billable) g.billableMinutes += minutes;
}

function toRows(map, idKey, labelKey) {
    return Array.from(map.values()).map((g) => ({
        [idKey]: g.key,
        [labelKey]: g.label,
        minutes: g.minutes,
        hours: round2(g.minutes / 60),
        billableMinutes: g.billableMinutes,
        billableHours: round2(g.billableMinutes / 60),
    })).sort((a, b) => a[idKey] - b[idKey]);
}

/**
 * @param entries array of { teMinutes, teBillable, teCustId, custName,
 *   teJobId, jobDesc, teWorkerId, workerName }. In-flight entries
 *   (teMinutes null) are skipped — they have no duration yet.
 * @returns totals + byCustomer / byJob / byWorker breakdowns.
 */
function buildHours(entries) {
    const byCustomer = new Map();
    const byJob = new Map();
    const byWorker = new Map();
    let totalMinutes = 0;
    let billableMinutes = 0;

    for (const e of entries || []) {
        // Skip in-flight entries — no duration yet. Guard null explicitly:
        // Number(null) is 0 (finite), which would otherwise count them.
        if (e.teMinutes == null) continue;
        const min = Number(e.teMinutes);
        if (!Number.isFinite(min)) continue;
        totalMinutes += min;
        if (e.teBillable) billableMinutes += min;
        addTo(byCustomer, e.teCustId, e.custName, min, e.teBillable);
        addTo(byJob, e.teJobId, e.jobDesc, min, e.teBillable);
        addTo(byWorker, e.teWorkerId, e.workerName, min, e.teBillable);
    }

    const nonBillableMinutes = totalMinutes - billableMinutes;
    return {
        totalMinutes,
        totalHours: round2(totalMinutes / 60),
        billableMinutes,
        billableHours: round2(billableMinutes / 60),
        nonBillableMinutes,
        nonBillableHours: round2(nonBillableMinutes / 60),
        byCustomer: toRows(byCustomer, 'custId', 'custName'),
        byJob: toRows(byJob, 'jobId', 'jobDesc'),
        byWorker: toRows(byWorker, 'workerId', 'workerName'),
    };
}

module.exports = { buildHours };
