// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { renderRevenuePdf } from '../../app/services/report-pdf.js';

const sample = {
    company: { name: 'Acme Consulting', footer: 'Thanks!' },
    title: 'Revenue Summary',
    range: { from: '2026-01-01', to: '2026-03-31' },
    generatedAt: '2026-04-01',
    currency: 'USD',
    totals: { invoiceCount: 3, revenue: 12000, collected: 9000, outstanding: 3000 },
    byCustomer: [
        { custName: 'Globex', invoiceCount: 2, revenue: 8000, collected: 6000, outstanding: 2000 },
        { custName: 'Initech', invoiceCount: 1, revenue: 4000, collected: 3000, outstanding: 1000 },
    ],
    byPeriod: [
        { period: '2026-01', invoiceCount: 1, revenue: 4000, collected: 4000 },
        { period: '2026-02', invoiceCount: 2, revenue: 8000, collected: 5000 },
    ],
};

describe('renderRevenuePdf (#433)', () => {
    test('produces a non-trivial PDF Buffer (starts with the %PDF magic)', async () => {
        const pdf = await renderRevenuePdf(sample);
        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.length).toBeGreaterThan(500);
        expect(pdf.slice(0, 5).toString('latin1')).toBe('%PDF-');
    });

    test('renders with empty data without throwing', async () => {
        const pdf = await renderRevenuePdf({ totals: {}, byCustomer: [], byPeriod: [] });
        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.slice(0, 5).toString('latin1')).toBe('%PDF-');
    });
});
