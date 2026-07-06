// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-profitability.js — project profitability & margin (#436).
 *
 * For each job: REVENUE is the billable time priced through rate.js; COST
 * is ALL logged time (billable or not — cost is cost) valued at the
 * worker's cost rate. MARGIN = revenue − cost; MARGIN% = margin / revenue.
 *
 * PURE: the caller loads closed time entries with their rate associations
 * (billingType, task, job, customer, worker.defaultBillingType) and the
 * worker's cost rate (worker.workerCostRate). No DB. Exact money via
 * money.js; in-flight entries (teMinutes null) are skipped.
 */

const money = require('./money.js');
const rate = require('./rate.js');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const numOrNull = (v) => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * @param entries closed time entries with { teId, teJobId, teMinutes,
 *   teBillable } + eager-loaded rate associations and worker.workerCostRate.
 * @returns { jobs[], totals, unresolvedRateEntryIds, entriesMissingCostRate }
 */
function buildProfitability(entries) {
    const map = new Map();
    const unresolvedRate = [];
    const noCostRate = [];

    for (const e of entries || []) {
        if (e.teMinutes == null) continue;
        const minutes = Number(e.teMinutes) || 0;
        const hours = minutes / 60;
        const key = e.teJobId == null ? 'none' : e.teJobId;

        let g = map.get(key);
        if (!g) {
            g = {
                jobId: e.teJobId == null ? null : e.teJobId,
                jobDesc: e.job ? e.job.jobDesc : null,
                billableMinutes: 0,
                totalMinutes: 0,
                revenueAmounts: [],
                costAmounts: [],
            };
            map.set(key, g);
        }
        g.totalMinutes += minutes;

        // Revenue: billable entries only, priced via rate.js.
        if (e.teBillable) {
            g.billableMinutes += minutes;
            const amt = rate.billableAmount(e);
            if (amt == null) unresolvedRate.push(e.teId);
            else g.revenueAmounts.push(amt);
        }

        // Cost: all logged time × the worker's cost rate.
        const costRate = e.worker ? numOrNull(e.worker.workerCostRate) : null;
        if (costRate == null) noCostRate.push(e.teId);
        else g.costAmounts.push(money.multiply(costRate, hours));
    }

    const jobs = [];
    let totalRevenue = 0;
    let totalCost = 0;
    for (const g of map.values()) {
        const revenue = money.sum(g.revenueAmounts);
        const cost = money.sum(g.costAmounts);
        const margin = money.subtract(revenue, cost);
        totalRevenue = money.add(totalRevenue, revenue);
        totalCost = money.add(totalCost, cost);
        jobs.push({
            jobId: g.jobId,
            jobDesc: g.jobDesc,
            billableMinutes: g.billableMinutes,
            totalMinutes: g.totalMinutes,
            revenue,
            cost,
            margin,
            marginPct: revenue > 0 ? round2((margin / revenue) * 100) : null,
        });
    }
    // Most profitable first.
    jobs.sort((a, b) => b.margin - a.margin);

    const totalMargin = money.subtract(totalRevenue, totalCost);
    return {
        jobs,
        totals: {
            revenue: totalRevenue,
            cost: totalCost,
            margin: totalMargin,
            marginPct: totalRevenue > 0 ? round2((totalMargin / totalRevenue) * 100) : null,
        },
        unresolvedRateEntryIds: unresolvedRate,
        entriesMissingCostRate: noCostRate,
    };
}

module.exports = { buildProfitability };
