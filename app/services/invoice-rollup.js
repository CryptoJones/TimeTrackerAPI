// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * invoice-rollup.js — aggregate billable time entries into invoice
 * lines, one line per Job.
 *
 * The invoice line item (InvoiceJob) is keyed by Job, so only time that
 * is (a) billable, (b) linked to a Job (teJobId), and (c) has a
 * resolvable rate can be rolled up. Everything else is reported back in
 * `skipped` so the caller can tell the user what wasn't billed and why —
 * silently dropping billable-but-rateless time would quietly lose money.
 *
 * PURE: the caller loads the entries (with their rate associations —
 * billingType and worker.defaultBillingType — eager-loaded) and this
 * module does only in-memory grouping + exact-money summation. No DB.
 */

const money = require('./money.js');
const rate = require('./rate.js');

/**
 * @param {Array} entries time-entry rows with { teId, teBillable,
 *   teJobId, teMinutes, teApprovalStatus } and eager-loaded rate associations.
 * @param {{ requireApproval?: boolean }} [opts] when `requireApproval` is set
 *   (the company's opt-in billing gate, #7), a billable entry that is not
 *   `approved` is reported as `skipped.notApproved` instead of being billed.
 * @returns {{ lines: Array<{jobId:number, amount:number, entryIds:number[]}>,
 *   subtotal:number, skipped:{ nonBillable:number[], noJob:number[], unresolvedRate:number[], notApproved:number[] } }}
 */
function buildRollup(entries, opts = {}) {
    const requireApproval = !!(opts && opts.requireApproval);
    const byJob = new Map(); // jobId -> { amounts:[], entryIds:[] }
    const skipped = { nonBillable: [], noJob: [], unresolvedRate: [], notApproved: [] };

    for (const e of entries || []) {
        if (!e.teBillable) { skipped.nonBillable.push(e.teId); continue; }
        if (e.teJobId == null) { skipped.noJob.push(e.teId); continue; }
        // Opt-in billing gate: only approved time bills when it's enabled.
        if (requireApproval && e.teApprovalStatus !== 'approved') { skipped.notApproved.push(e.teId); continue; }
        const amount = rate.billableAmount(e);
        if (amount == null) { skipped.unresolvedRate.push(e.teId); continue; }
        const group = byJob.get(e.teJobId) || { amounts: [], entryIds: [] };
        group.amounts.push(amount);
        group.entryIds.push(e.teId);
        byJob.set(e.teJobId, group);
    }

    const lines = [];
    for (const [jobId, group] of byJob) {
        lines.push({ jobId, amount: money.sum(group.amounts), entryIds: group.entryIds });
    }
    // Deterministic order so invoices read consistently and tests are stable.
    lines.sort((a, b) => a.jobId - b.jobId);

    const subtotal = money.sum(lines.map((l) => l.amount));
    return { lines, subtotal, skipped };
}

module.exports = { buildRollup };
