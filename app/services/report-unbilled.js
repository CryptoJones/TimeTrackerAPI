// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-unbilled.js — aggregate billable time that hasn't been invoiced
 * yet, grouped customer → job (#48). This is the "money you haven't
 * billed" view that drives the next roll-up.
 *
 * PURE: the caller loads billable, uninvoiced, job-linked time entries
 * with their rate associations (and customer/job names); this prices
 * each via rate.js and sums exactly via money.js. No DB.
 */

const money = require('./money.js');
const rate = require('./rate.js');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param entries array of { teId, teCustId, custName, teJobId, jobDesc,
 *   teMinutes, teBillable } with eager-loaded rate associations.
 * @returns { customers, totalMinutes, totalHours, totalAmount, unresolvedRate }
 *   customers[] = { custId, custName, minutes, hours, amount, jobs[] };
 *   jobs[] = { jobId, jobDesc, minutes, hours, amount, entryCount }.
 *   unresolvedRate = ids of billable entries with no resolvable rate.
 */
function buildUnbilled(entries) {
    const custMap = new Map();
    const unresolvedRate = [];

    for (const e of entries || []) {
        if (!e.teBillable) continue;
        if (e.teJobId == null) continue;
        const amount = rate.billableAmount(e);
        if (amount == null) { unresolvedRate.push(e.teId); continue; }

        let c = custMap.get(e.teCustId);
        if (!c) { c = { custId: e.teCustId, custName: e.custName || null, jobs: new Map() }; custMap.set(e.teCustId, c); }
        let j = c.jobs.get(e.teJobId);
        if (!j) { j = { jobId: e.teJobId, jobDesc: e.jobDesc || null, minutes: 0, amounts: [], count: 0 }; c.jobs.set(e.teJobId, j); }
        j.minutes += Number(e.teMinutes) || 0;
        j.amounts.push(amount);
        j.count += 1;
    }

    const customers = [];
    const allAmounts = [];
    let totalMinutes = 0;
    for (const c of custMap.values()) {
        const jobs = [];
        const custAmounts = [];
        let custMinutes = 0;
        for (const j of c.jobs.values()) {
            const amount = money.sum(j.amounts);
            jobs.push({ jobId: j.jobId, jobDesc: j.jobDesc, minutes: j.minutes, hours: round2(j.minutes / 60), amount, entryCount: j.count });
            custAmounts.push(amount);
            custMinutes += j.minutes;
            allAmounts.push(amount);
        }
        jobs.sort((a, b) => a.jobId - b.jobId);
        totalMinutes += custMinutes;
        customers.push({
            custId: c.custId, custName: c.custName,
            minutes: custMinutes, hours: round2(custMinutes / 60),
            amount: money.sum(custAmounts), jobs,
        });
    }
    customers.sort((a, b) => a.custId - b.custId);

    return {
        customers,
        totalMinutes,
        totalHours: round2(totalMinutes / 60),
        totalAmount: money.sum(allAmounts),
        unresolvedRate,
    };
}

module.exports = { buildUnbilled };
