// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the billable-vs-non-billable summary
// (app/services/report-billable-summary.js).

import { describe, test, expect } from 'vitest';

const { buildBillableSummary, periodOf } = require('../../app/services/report-billable-summary.js');

// entry at a per-entry hourly rate on a given start date.
const e = (teId, teStartedAt, teMinutes, teBillable, hourly) => ({
    teId, teStartedAt, teMinutes, teBillable,
    billingType: hourly == null ? null : { btHourlyRate: hourly },
});

describe('report-billable-summary.periodOf', () => {
    test('extracts YYYY-MM from an ISO string or Date', () => {
        expect(periodOf('2026-07-05T09:00:00Z')).toBe('2026-07');
        expect(periodOf(null)).toBe('unknown');
    });
});

describe('report-billable-summary.buildBillableSummary', () => {
    test('splits billable / non-billable by month with the overall ratio', () => {
        const r = buildBillableSummary([
            e(1, '2026-06-01T09:00:00Z', 60, true, 100),   // Jun: 60 billable, $100
            e(2, '2026-06-02T09:00:00Z', 60, false, 100),  // Jun: 60 non-billable
            e(3, '2026-07-01T09:00:00Z', 120, true, 50),   // Jul: 120 billable, $100
        ]);
        expect(r.totalBillableMinutes).toBe(180);
        expect(r.totalNonBillableMinutes).toBe(60);
        expect(r.totalBillableHours).toBe(3);
        expect(r.billableRatio).toBe(0.75); // 180 / 240
        expect(r.totalBillableAmount).toBe(200);
        expect(r.periods).toEqual([
            { period: '2026-06', billableMinutes: 60, nonBillableMinutes: 60, billableHours: 1, nonBillableHours: 1, billableAmount: 100 },
            { period: '2026-07', billableMinutes: 120, nonBillableMinutes: 0, billableHours: 2, nonBillableHours: 0, billableAmount: 100 },
        ]);
    });

    test('unresolved billable rate counts minutes but not amount', () => {
        const r = buildBillableSummary([
            e(1, '2026-07-01T09:00:00Z', 60, true, null), // billable, no rate
        ]);
        expect(r.totalBillableMinutes).toBe(60);
        expect(r.totalBillableAmount).toBe(0);
        expect(r.unresolvedRateEntries).toBe(1);
    });

    test('skips in-flight entries; empty input → zero ratio', () => {
        const r = buildBillableSummary([e(1, '2026-07-01T09:00:00Z', null, true, 100)]);
        expect(r.totalBillableMinutes).toBe(0);
        expect(buildBillableSummary([]).billableRatio).toBe(0);
    });
});
