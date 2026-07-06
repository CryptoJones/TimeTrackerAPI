// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * approval-reminders.js — build a digest email for time entries stuck in
 * the "submitted" (awaiting approval) state (#442). Pure: the caller
 * loads the stale submitted entries (with their worker) and this shapes
 * the subject + body. No DB, no mail transport.
 */

/**
 * @param entries submitted time entries with { teId, teStartedAt,
 *   teMinutes, worker: { workerFName, workerLName } }.
 * @param opts { olderThanDays? } — informational, for the message text.
 * @returns { count, totalMinutes, entries: [...], subject, text }.
 */
function buildApprovalDigest(entries, opts = {}) {
    const rows = (entries || []).map((e) => ({
        teId: e.teId,
        worker: e.worker
            ? ([e.worker.workerFName, e.worker.workerLName].filter(Boolean).join(' ') || null)
            : null,
        date: e.teStartedAt ? String(e.teStartedAt).slice(0, 10) : null,
        minutes: e.teMinutes == null ? null : Number(e.teMinutes),
    }));

    const count = rows.length;
    const totalMinutes = rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0);
    const olderThanDays = Number.isInteger(opts.olderThanDays) && opts.olderThanDays > 0 ? opts.olderThanDays : null;

    const subject = count === 1
        ? '1 time entry awaiting approval'
        : `${count} time entries awaiting approval`;

    const header = 'The following time entries have been awaiting approval'
        + (olderThanDays ? ` for more than ${olderThanDays} day(s)` : '') + ':';
    const lines = rows.map((r) => (
        `- #${r.teId}  ${r.worker || 'Unknown worker'}  ${r.date || '(no date)'}  `
        + (r.minutes == null ? '(in progress)' : `${r.minutes} min`)
    ));
    const text = `${header}\n\n${lines.join('\n')}\n\n`
        + `Total: ${count} ${count === 1 ? 'entry' : 'entries'}, ${totalMinutes} minutes.`;

    return { count, totalMinutes, entries: rows, subject, text };
}

module.exports = { buildApprovalDigest };
