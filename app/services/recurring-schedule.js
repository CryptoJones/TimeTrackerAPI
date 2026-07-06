// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * recurring-schedule.js — cadence date math for recurring invoices (#425).
 *
 * PURE: given a 'YYYY-MM-DD' date and a cadence, returns the next
 * occurrence. Month-based cadences clamp the day to the target month's
 * last day (Jan 31 + 1 month → Feb 28/29), so end-of-month schedules
 * never skip a month. All arithmetic is in UTC to avoid TZ drift.
 */

const CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'];
const MONTHS_FOR = { monthly: 1, quarterly: 3, yearly: 12 };

/**
 * @param {string} iso a 'YYYY-MM-DD' date.
 * @param {string} cadence one of CADENCES.
 * @returns {string|null} the next 'YYYY-MM-DD', or null on bad input.
 */
function advanceDate(iso, cadence) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1; // 0-based
    const day = Number(m[3]);

    if (cadence === 'weekly') {
        const d = new Date(Date.UTC(year, month, day + 7));
        return d.toISOString().slice(0, 10);
    }

    const addMonths = MONTHS_FOR[cadence];
    if (!addMonths) return null;

    const total = month + addMonths;
    const newYear = year + Math.floor(total / 12);
    const newMonth = ((total % 12) + 12) % 12;
    // Clamp to the last day of the target month.
    const lastDay = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
    const newDay = Math.min(day, lastDay);
    const d = new Date(Date.UTC(newYear, newMonth, newDay));
    return d.toISOString().slice(0, 10);
}

module.exports = { advanceDate, CADENCES };
