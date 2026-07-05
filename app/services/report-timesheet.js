// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-timesheet.js — a timesheet grid: hours per worker per day (or
 * per week) over a date range (#398). The classic "who worked how much
 * when" view.
 *
 * PURE: the caller loads closed time entries (with the worker's name);
 * this buckets minutes by worker × period. No DB. Weeks bucket to their
 * Monday (ISO week start).
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 'YYYY-MM-DD' from a Date or ISO string, else 'unknown'. */
function isoDatePart(startedAt) {
    if (!startedAt) return 'unknown';
    let s;
    if (typeof startedAt === 'string') s = startedAt;
    else if (startedAt instanceof Date) s = startedAt.toISOString();
    else s = String(startedAt);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : 'unknown';
}

function dayKey(startedAt) {
    return isoDatePart(startedAt);
}

/** The Monday (UTC) of the entry's ISO week, as 'YYYY-MM-DD'. */
function weekKey(startedAt) {
    const d = isoDatePart(startedAt);
    if (d === 'unknown') return 'unknown';
    const dt = new Date(d + 'T00:00:00.000Z');
    const dow = dt.getUTCDay();          // 0=Sun..6=Sat
    const backToMonday = dow === 0 ? 6 : dow - 1;
    dt.setUTCDate(dt.getUTCDate() - backToMonday);
    return dt.toISOString().slice(0, 10);
}

/**
 * @param entries closed time entries with { teMinutes, teStartedAt,
 *   teWorkerId, workerName }. In-flight entries (null minutes) skipped.
 * @param period 'day' (default) or 'week'.
 * @returns { period, buckets, rows, bucketTotals, grandTotal* }.
 *   rows[] = { workerId, workerName, buckets:[{bucket,minutes,hours}],
 *   totalMinutes, totalHours }; bucketTotals mirror per column.
 */
function buildTimesheet(entries, period) {
    const p = period === 'week' ? 'week' : 'day';
    const keyFn = p === 'week' ? weekKey : dayKey;
    const workers = new Map();
    const bucketTotals = new Map();

    for (const e of entries || []) {
        if (e.teMinutes == null) continue;
        const m = Number(e.teMinutes) || 0;
        const bucket = keyFn(e.teStartedAt);
        const wid = e.teWorkerId == null ? 0 : e.teWorkerId;
        let w = workers.get(wid);
        if (!w) {
            w = { workerId: wid || null, workerName: e.workerName || (wid ? null : 'Unassigned'), cells: new Map() };
            workers.set(wid, w);
        }
        w.cells.set(bucket, (w.cells.get(bucket) || 0) + m);
        bucketTotals.set(bucket, (bucketTotals.get(bucket) || 0) + m);
    }

    const buckets = Array.from(bucketTotals.keys()).sort();
    const rows = Array.from(workers.values()).map((w) => {
        let total = 0;
        const cells = buckets.map((b) => {
            const min = w.cells.get(b) || 0;
            total += min;
            return { bucket: b, minutes: min, hours: round2(min / 60) };
        });
        return {
            workerId: w.workerId,
            workerName: w.workerName,
            buckets: cells,
            totalMinutes: total,
            totalHours: round2(total / 60),
        };
    }).sort((a, b) => (a.workerId || 0) - (b.workerId || 0));

    const cols = buckets.map((b) => {
        const min = bucketTotals.get(b);
        return { bucket: b, minutes: min, hours: round2(min / 60) };
    });
    const grand = cols.reduce((s, c) => s + c.minutes, 0);

    return {
        period: p,
        buckets,
        rows,
        bucketTotals: cols,
        grandTotalMinutes: grand,
        grandTotalHours: round2(grand / 60),
    };
}

module.exports = { buildTimesheet, dayKey, weekKey };
