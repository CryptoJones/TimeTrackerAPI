// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * report-email.js — format a report as an email subject + body for
 * scheduled delivery (#57). Currently the revenue summary. PURE: takes a
 * built report object (from report-revenue.js) and returns { subject,
 * text }. No DB, no transport; money via money.js.
 */

const money = require('./money.js');

const REPORTS = ['revenue'];

const fmt = (n) => money.toFixedString(n == null ? 0 : n);

/** @param report the buildRevenue() output. @param opts { company?, generatedAt? } */
function formatRevenueText(report, opts = {}) {
    const r = report || {};
    const lines = [];
    lines.push(`Revenue summary${opts.company ? ' for ' + opts.company : ''}${opts.generatedAt ? ' (as of ' + opts.generatedAt + ')' : ''}:`);
    lines.push('');
    lines.push(`Invoices:            ${r.invoiceCount || 0}`);
    lines.push(`Revenue (invoiced):  ${fmt(r.totalRevenue)}`);
    lines.push(`Collected:           ${fmt(r.totalCollected)}`);
    lines.push(`Outstanding:         ${fmt(r.totalOutstanding)}`);

    const byCust = Array.isArray(r.byCustomer) ? r.byCustomer.slice(0, 10) : [];
    if (byCust.length) {
        lines.push('');
        lines.push('By customer:');
        for (const c of byCust) {
            lines.push(`  - ${c.custName || 'Unknown'}: revenue ${fmt(c.revenue)}, outstanding ${fmt(c.outstanding)}`);
        }
    }

    return {
        subject: `Revenue report${opts.company ? ' — ' + opts.company : ''}`,
        text: lines.join('\n'),
    };
}

/** Dispatch a report name → { subject, text }. */
function formatReport(reportName, report, opts) {
    if (reportName === 'revenue') return formatRevenueText(report, opts);
    return { subject: 'Report', text: 'Unsupported report.' };
}

module.exports = { REPORTS, formatRevenueText, formatReport };
