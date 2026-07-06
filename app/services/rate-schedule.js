// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * rate-schedule.js — resolve the rate effective on a given date from a
 * set of dated rate schedules (#414). PURE: no DB. A schedule applies on
 * `date` when effectiveFrom <= date <= effectiveTo (or effectiveTo is
 * null = open-ended). When several apply, the one with the latest
 * effectiveFrom wins (the most recently-introduced rate). Dates are
 * 'YYYY-MM-DD' strings, compared lexicographically (== chronologically).
 */

function numOrNull(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param schedules array of { effectiveFrom, effectiveTo, rate }.
 * @param date 'YYYY-MM-DD'.
 * @returns the effective rate (Number) or null when none applies.
 */
function rateOnDate(schedules, date) {
    if (!date) return null;
    let best = null;
    for (const s of schedules || []) {
        const from = s.effectiveFrom || null;
        const to = s.effectiveTo || null;
        if (!from || date < from) continue;   // not yet effective
        if (to && date > to) continue;        // expired
        if (!best || from > best.from) best = { from, rate: numOrNull(s.rate) };
    }
    return best ? best.rate : null;
}

module.exports = { rateOnDate };
