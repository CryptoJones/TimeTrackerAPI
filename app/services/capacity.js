// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * capacity.js — worker capacity / utilization for resource planning (#459).
 * PURE: no DB, no I/O. Given completed time entries and workers (with a
 * `workerTargetMinsPerWeek` target), compute per-worker target vs. logged
 * hours, utilization %, and remaining capacity over a period. Unlike
 * payroll, EVERY worker is listed (a zero-logged worker has full remaining
 * capacity — the point of planning).
 */

/** Minutes → hours, rounded to 2 decimals. */
function hoursFromMinutes(min) {
    return Math.round((Number(min || 0) / 60) * 100) / 100;
}

/** Whole+fractional weeks spanned by an inclusive [from, to] date range. */
function weeksBetween(from, to) {
    const a = new Date(`${from}T00:00:00Z`).getTime();
    const b = new Date(`${to}T00:00:00Z`).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
    const days = Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1; // inclusive
    return Math.round((days / 7) * 100) / 100;
}

function pct(part, whole) {
    if (!whole || whole <= 0) return null;
    return Math.round((part / whole) * 1000) / 10; // 1 decimal
}

/**
 * @param entries [{ teWorkerId, teMinutes }].
 * @param workers [{ workerId, workerFName, workerLName, workerTargetMinsPerWeek }].
 * @param opts { from, to, weeks }.
 */
function buildCapacity(entries, workers, opts = {}) {
    const weeks = Number(opts.weeks) || 0;

    const logged = new Map();
    for (const e of entries || []) {
        const wid = e.teWorkerId;
        if (wid == null) continue;
        logged.set(wid, (logged.get(wid) || 0) + (Number(e.teMinutes) || 0));
    }

    const rows = [];
    let totalTarget = 0;
    let totalLogged = 0;
    for (const w of workers || []) {
        const perWeek = w.workerTargetMinsPerWeek == null ? null : Number(w.workerTargetMinsPerWeek);
        const targetMinutes = perWeek != null ? Math.round(perWeek * weeks) : null;
        const loggedMinutes = logged.get(w.workerId) || 0;
        const remainingMinutes = targetMinutes != null ? targetMinutes - loggedMinutes : null;
        rows.push({
            workerId: w.workerId,
            workerName: [w.workerFName, w.workerLName].filter(Boolean).join(' ') || null,
            targetHours: targetMinutes != null ? hoursFromMinutes(targetMinutes) : null,
            loggedHours: hoursFromMinutes(loggedMinutes),
            remainingHours: remainingMinutes != null ? hoursFromMinutes(remainingMinutes) : null,
            utilizationPct: pct(loggedMinutes, targetMinutes),
        });
        if (targetMinutes != null) totalTarget += targetMinutes;
        totalLogged += loggedMinutes;
    }
    rows.sort((a, b) => a.workerId - b.workerId);

    return {
        periodStart: opts.from || null,
        periodEnd: opts.to || null,
        weeks,
        rows,
        totals: {
            workers: rows.length,
            targetHours: hoursFromMinutes(totalTarget),
            loggedHours: hoursFromMinutes(totalLogged),
            utilizationPct: pct(totalLogged, totalTarget),
        },
    };
}

module.exports = { buildCapacity, weeksBetween, hoursFromMinutes };
