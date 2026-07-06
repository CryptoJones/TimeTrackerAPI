// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the timesheet grid (app/services/report-timesheet.js).

import { describe, test, expect } from 'vitest';

const { buildTimesheet, dayKey, weekKey } = require('../../app/services/report-timesheet.js');

const e = (teWorkerId, workerName, teStartedAt, teMinutes) => ({ teWorkerId, workerName, teStartedAt, teMinutes });

describe('report-timesheet keys', () => {
    test('dayKey extracts the date', () => {
        expect(dayKey('2026-07-05T14:00:00Z')).toBe('2026-07-05');
    });
    test('weekKey buckets to the Monday of the ISO week', () => {
        // 2026-07-05 is a Sunday → Monday 2026-06-29.
        expect(weekKey('2026-07-05T14:00:00Z')).toBe('2026-06-29');
        // 2026-07-06 is a Monday → itself.
        expect(weekKey('2026-07-06T09:00:00Z')).toBe('2026-07-06');
    });
    test('weekKey returns the "unknown" sentinel on a calendar-invalid date (no throw)', () => {
        // isoDatePart only validates format; '2026-13-45' parses to Invalid
        // Date. weekKey must not throw RangeError — parity with dayKey.
        expect(() => weekKey('2026-13-45')).not.toThrow();
        expect(weekKey('2026-13-45')).toBe('unknown');
        expect(weekKey('nope')).toBe('unknown');
    });
});

describe('report-timesheet.buildTimesheet', () => {
    test('grid by worker × day with row + column totals', () => {
        const r = buildTimesheet([
            e(1, 'Wanda', '2026-07-06T09:00:00Z', 60),
            e(1, 'Wanda', '2026-07-06T13:00:00Z', 30),
            e(1, 'Wanda', '2026-07-07T09:00:00Z', 120),
            e(2, 'Vic', '2026-07-06T09:00:00Z', 45),
        ], 'day');
        expect(r.period).toBe('day');
        expect(r.buckets).toEqual(['2026-07-06', '2026-07-07']);
        const wanda = r.rows.find((x) => x.workerId === 1);
        expect(wanda.buckets.map((b) => b.minutes)).toEqual([90, 120]);
        expect(wanda.totalHours).toBe(3.5);
        expect(r.bucketTotals.map((c) => c.minutes)).toEqual([135, 120]); // day1: 90+45, day2: 120
        expect(r.grandTotalHours).toBe(round(255));
    });

    test('week period buckets days into their Monday; unassigned worker labelled', () => {
        const r = buildTimesheet([
            e(null, null, '2026-07-06T09:00:00Z', 60), // Mon week 07-06
            e(null, null, '2026-07-08T09:00:00Z', 60), // Wed same week
        ], 'week');
        expect(r.buckets).toEqual(['2026-07-06']);
        expect(r.rows[0].workerName).toBe('Unassigned');
        expect(r.rows[0].totalHours).toBe(2);
    });

    test('skips in-flight entries; empty → zero grand total', () => {
        expect(buildTimesheet([e(1, 'W', '2026-07-06T09:00:00Z', null)], 'day').grandTotalMinutes).toBe(0);
        expect(buildTimesheet([]).grandTotalHours).toBe(0);
    });
});

function round(min) { return Math.round((min / 60) * 100) / 100; }
