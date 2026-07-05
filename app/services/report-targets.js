// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-targets.js — worker capacity: actual hours vs target over a
 * date range (#400). Each worker's weekly target is scaled by the number
 * of ISO weeks in the range, then compared to what they actually logged,
 * flagging under / on / over (±10% band).
 *
 * PURE: the caller loads the workers (with a target + summed actual
 * minutes) and the week count. No DB.
 */

const { weekKey } = require('./report-timesheet.js');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const BAND = 0.1;

/** under / on / over from a ratio; 'no-target' when the ratio is null. */
function statusOf(ratio) {
    if (ratio == null) return 'no-target';
    if (ratio > 1 + BAND) return 'over';
    if (ratio < 1 - BAND) return 'under';
    return 'on';
}

/** Count of ISO weeks spanned by [fromISO, toISO] (inclusive), min 1. */
function weeksBetween(fromISO, toISO) {
    const w1 = weekKey(fromISO);
    const w2 = weekKey(toISO);
    if (w1 === 'unknown' || w2 === 'unknown') return 1;
    const d1 = new Date(w1 + 'T00:00:00.000Z').getTime();
    const d2 = new Date(w2 + 'T00:00:00.000Z').getTime();
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) return 1;
    return Math.max(1, Math.round((d2 - d1) / (7 * 86400000)) + 1);
}

/**
 * @param workers array of { workerId, workerName, targetMinsPerWeek,
 *   actualMins }.
 * @param weeks number of weeks the target applies over.
 * @returns { weeks, workers: [...rows], count, underCount }.
 */
function buildTargets(workers, weeks) {
    const w = Math.max(1, Math.round(Number(weeks) || 1));
    const rows = (workers || []).map((x) => {
        const perWeek = x.targetMinsPerWeek == null ? null : Number(x.targetMinsPerWeek);
        const targetMins = perWeek == null ? null : perWeek * w;
        const actualMins = Number(x.actualMins) || 0;
        const ratio = (targetMins == null || targetMins <= 0) ? null : actualMins / targetMins;
        return {
            workerId: x.workerId,
            workerName: x.workerName || null,
            targetMinutesPerWeek: perWeek,
            targetMinutes: targetMins,
            targetHours: targetMins == null ? null : round2(targetMins / 60),
            actualMinutes: actualMins,
            actualHours: round2(actualMins / 60),
            ratio: ratio == null ? null : round2(ratio),
            status: statusOf(ratio),
        };
    }).sort((a, b) => a.workerId - b.workerId);

    const underCount = rows.filter((r) => r.status === 'under').length;
    return { weeks: w, workers: rows, count: rows.length, underCount };
}

module.exports = { buildTargets, weeksBetween, statusOf };
