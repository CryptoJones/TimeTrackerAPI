// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { formatRevenueText, formatReport, REPORTS } from '../../app/services/report-email.js';

const REPORT = {
    invoiceCount: 3,
    totalRevenue: 12000,
    totalCollected: 9000,
    totalOutstanding: 3000,
    byCustomer: [
        { custName: 'Globex', revenue: 8000, collected: 6000, outstanding: 2000 },
        { custName: 'Initech', revenue: 4000, collected: 3000, outstanding: 1000 },
    ],
};

describe('report-email (#57)', () => {
    test('formatRevenueText renders subject + totals + per-customer lines', () => {
        const { subject, text } = formatRevenueText(REPORT, { company: 'Acme', generatedAt: '2026-04-01' });
        expect(subject).toBe('Revenue report — Acme');
        expect(text).toContain('Revenue summary for Acme (as of 2026-04-01)');
        expect(text).toContain('Invoices:            3');
        expect(text).toContain('Revenue (invoiced):  12000.00');
        expect(text).toContain('Outstanding:         3000.00');
        expect(text).toContain('- Globex: revenue 8000.00, outstanding 2000.00');
    });

    test('handles an empty report', () => {
        const { text } = formatRevenueText({});
        expect(text).toContain('Invoices:            0');
        expect(text).toContain('Revenue (invoiced):  0.00');
    });

    test('formatReport dispatches known reports and REPORTS lists revenue', () => {
        expect(REPORTS).toContain('revenue');
        expect(formatReport('revenue', REPORT).subject).toBe('Revenue report');
        expect(formatReport('unknown', REPORT).text).toBe('Unsupported report.');
    });
});
