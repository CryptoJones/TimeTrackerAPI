// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-revenue.js — revenue & earnings summary (#429). Revenue is
 * what's been invoiced (invoice total); "collected" is what's been paid
 * against those invoices; outstanding is the difference. Grouped by
 * customer and by month.
 *
 * PURE: the caller loads the invoices (with each invoice's total and the
 * sum of its allocated payments); this does exact-money aggregation. No
 * DB.
 */

const money = require('./money.js');

/** 'YYYY-MM' period from a 'YYYY-MM-DD' invoice date. */
function periodOf(invDate) {
    return typeof invDate === 'string' && /^\d{4}-\d{2}/.test(invDate) ? invDate.slice(0, 7) : 'unknown';
}

/**
 * @param invoices array of { custId, custName, invDate, total, collected }.
 *   total / collected may be null (treated as 0).
 * @returns totals + byCustomer / byPeriod breakdowns.
 */
function buildRevenue(invoices) {
    const byCust = new Map();
    const byPeriod = new Map();
    const allRevenue = [];
    const allCollected = [];

    for (const inv of invoices || []) {
        const revenue = inv.total == null ? 0 : Number(inv.total);
        const collected = inv.collected == null ? 0 : Number(inv.collected);
        allRevenue.push(revenue);
        allCollected.push(collected);

        let c = byCust.get(inv.custId);
        if (!c) { c = { custId: inv.custId, custName: inv.custName || null, count: 0, revenue: [], collected: [] }; byCust.set(inv.custId, c); }
        c.count += 1; c.revenue.push(revenue); c.collected.push(collected);

        const p = periodOf(inv.invDate);
        let g = byPeriod.get(p);
        if (!g) { g = { period: p, count: 0, revenue: [], collected: [] }; byPeriod.set(p, g); }
        g.count += 1; g.revenue.push(revenue); g.collected.push(collected);
    }

    const byCustomer = Array.from(byCust.values()).map((c) => {
        const revenue = money.sum(c.revenue);
        const collected = money.sum(c.collected);
        return {
            custId: c.custId, custName: c.custName, invoiceCount: c.count,
            revenue, collected, outstanding: money.subtract(revenue, collected),
        };
    }).sort((a, b) => a.custId - b.custId);

    const byPeriodRows = Array.from(byPeriod.values()).map((g) => ({
        period: g.period, invoiceCount: g.count,
        revenue: money.sum(g.revenue), collected: money.sum(g.collected),
    })).sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));

    const totalRevenue = money.sum(allRevenue);
    const totalCollected = money.sum(allCollected);
    return {
        invoiceCount: (invoices || []).length,
        totalRevenue,
        totalCollected,
        totalOutstanding: money.subtract(totalRevenue, totalCollected),
        byCustomer,
        byPeriod: byPeriodRows,
    };
}

module.exports = { buildRevenue, periodOf };
