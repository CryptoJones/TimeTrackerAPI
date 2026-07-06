// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * payment-reminders.js — build a dunning digest of overdue invoices with
 * a balance outstanding (#10). An invoice counts when its reference date
 * (due date, else invoice date) is at least `olderThanDays` days in the
 * past AND total − collected > 0. Pure: the caller loads invoices with
 * their payment totals and passes `today`; exact money via money.js.
 */

const money = require('./money.js');

/** ISO date `days` before `iso` (YYYY-MM-DD), UTC. */
function minusDays(iso, days) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00.000Z');
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

/**
 * @param invoices [{ invId, invNumber, custName, date, dueDate, total, collected }]
 * @param opts { today: 'YYYY-MM-DD', olderThanDays?: number }
 * @returns { count, totalOutstanding, invoices: [...], subject, text }
 */
function buildDunningDigest(invoices, opts = {}) {
    const today = opts.today || null;
    const olderThanDays = Number.isInteger(opts.olderThanDays) && opts.olderThanDays >= 0 ? opts.olderThanDays : 0;
    const cutoff = olderThanDays > 0 ? minusDays(today, olderThanDays) : today;

    const rows = [];
    for (const inv of invoices || []) {
        const total = inv.total == null ? 0 : Number(inv.total);
        const collected = inv.collected == null ? 0 : Number(inv.collected);
        const outstanding = money.subtract(total, collected);
        if (outstanding <= 0) continue;
        const refDate = inv.dueDate || inv.date || null;
        // Flag when the reference date is on OR before the cutoff — i.e. the
        // invoice is *at least* olderThanDays days in the past, matching the
        // module contract. An invoice due exactly olderThanDays ago counts
        // (previously a strict `>= cutoff` skip excluded that boundary day).
        if (!refDate || !cutoff || refDate > cutoff) continue;
        rows.push({
            invId: inv.invId,
            invNumber: inv.invNumber || null,
            custName: inv.custName || null,
            date: inv.date || null,
            dueDate: inv.dueDate || null,
            total,
            collected,
            outstanding,
        });
    }
    rows.sort((a, b) => b.outstanding - a.outstanding);

    const count = rows.length;
    const totalOutstanding = money.sum(rows.map((r) => r.outstanding));
    const subject = count === 1 ? '1 overdue invoice' : `${count} overdue invoices`;
    const lines = rows.map((r) => (
        `- ${r.invNumber || '#' + r.invId}  ${r.custName || 'Unknown'}  `
        + `due ${r.dueDate || r.date || '?'}  outstanding ${money.toFixedString(r.outstanding)}`
    ));
    const text = 'The following invoices are overdue with a balance outstanding:\n\n'
        + `${lines.join('\n')}\n\n`
        + `Total outstanding: ${money.toFixedString(totalOutstanding)} across ${count} ${count === 1 ? 'invoice' : 'invoices'}.`;

    return { count, totalOutstanding, invoices: rows, subject, text };
}

module.exports = { buildDunningDigest };
