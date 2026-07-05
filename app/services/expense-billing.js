// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * expense-billing.js — what to charge a client for an expense (#417).
 *
 * A billable expense is re-billed at cost, optionally with a percentage
 * markup (expMarkupPct, a fraction: 0.15 = +15%). Non-billable expenses
 * bill nothing. Exact-cent through money.js.
 *
 * PURE: no DB.
 */

const money = require('./money.js');

/** Coerce a markup fraction to a sane non-negative number. Bad → 0. */
function normalizeMarkup(pct) {
    const n = typeof pct === 'string' ? Number(pct) : pct;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0;
    return n;
}

/**
 * Amount to bill the client for an expense: 0 when not billable, else
 * cost × (1 + markup) rounded to the cent. null when the cost is unknown.
 * @param expense { expBillable, expAmount, expMarkupPct }
 */
function billableAmount(expense) {
    if (!expense || !expense.expBillable) return 0;
    if (expense.expAmount == null) return null;
    return money.multiply(expense.expAmount, 1 + normalizeMarkup(expense.expMarkupPct));
}

module.exports = { normalizeMarkup, billableAmount };
