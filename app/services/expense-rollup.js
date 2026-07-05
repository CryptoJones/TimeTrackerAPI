// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * expense-rollup.js — turn billable, un-invoiced expenses into invoice
 * charges (#418). Each billable expense contributes its client-facing
 * amount (cost × (1 + markup), from expense-billing) to the invoice.
 *
 * PURE: the caller loads the billable, un-invoiced expenses; this prices
 * and sums them exactly. No DB.
 */

const money = require('./money.js');
const { billableAmount } = require('./expense-billing.js');

/**
 * @param expenses array of Expense-shaped { expId, expBillable, expAmount,
 *   expMarkupPct, expCategory, expDescription }.
 * @returns { lines, subtotal, skipped } — lines[] = { expId, category,
 *   description, amount }; skipped.nonBillable = ids with no billable
 *   amount.
 */
function buildExpenseRollup(expenses) {
    const lines = [];
    const amounts = [];
    const skipped = { nonBillable: [] };

    for (const e of expenses || []) {
        const amount = billableAmount(e);
        // billableAmount is 0 for non-billable and null for unknown cost;
        // neither belongs on an invoice.
        if (amount == null || amount <= 0) {
            skipped.nonBillable.push(e.expId);
            continue;
        }
        lines.push({
            expId: e.expId,
            category: e.expCategory || null,
            description: e.expDescription || null,
            amount,
        });
        amounts.push(amount);
    }

    return { lines, subtotal: money.sum(amounts), skipped };
}

module.exports = { buildExpenseRollup };
