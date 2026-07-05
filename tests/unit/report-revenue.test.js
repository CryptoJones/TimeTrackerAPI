// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the revenue summary (app/services/report-revenue.js).

import { describe, test, expect } from 'vitest';

const { buildRevenue, periodOf } = require('../../app/services/report-revenue.js');

const inv = (custId, custName, invDate, total, collected) => ({ custId, custName, invDate, total, collected });

describe('report-revenue.periodOf', () => {
    test('extracts YYYY-MM', () => {
        expect(periodOf('2026-07-05')).toBe('2026-07');
        expect(periodOf(null)).toBe('unknown');
    });
});

describe('report-revenue.buildRevenue', () => {
    test('totals revenue, collected, and outstanding exactly', () => {
        const r = buildRevenue([
            inv(1, 'A', '2026-06-01', 100, 100),   // paid
            inv(1, 'A', '2026-07-01', 200, 50),    // partial
            inv(2, 'B', '2026-07-15', 33.33, 0),
        ]);
        expect(r.invoiceCount).toBe(3);
        expect(r.totalRevenue).toBe(333.33);
        expect(r.totalCollected).toBe(150);
        expect(r.totalOutstanding).toBe(183.33);
    });

    test('groups by customer (with outstanding) and by month', () => {
        const r = buildRevenue([
            inv(1, 'A', '2026-06-10', 100, 40),
            inv(1, 'A', '2026-07-10', 200, 200),
            inv(2, 'B', '2026-07-20', 50, 0),
        ]);
        expect(r.byCustomer).toEqual([
            { custId: 1, custName: 'A', invoiceCount: 2, revenue: 300, collected: 240, outstanding: 60 },
            { custId: 2, custName: 'B', invoiceCount: 1, revenue: 50, collected: 0, outstanding: 50 },
        ]);
        expect(r.byPeriod).toEqual([
            { period: '2026-06', invoiceCount: 1, revenue: 100, collected: 40 },
            { period: '2026-07', invoiceCount: 2, revenue: 250, collected: 200 },
        ]);
    });

    test('null totals count as zero; empty input → zeros', () => {
        const r = buildRevenue([inv(1, 'A', '2026-07-01', null, null)]);
        expect(r.totalRevenue).toBe(0);
        expect(buildRevenue([]).totalRevenue).toBe(0);
        expect(buildRevenue([]).byCustomer).toEqual([]);
    });
});
