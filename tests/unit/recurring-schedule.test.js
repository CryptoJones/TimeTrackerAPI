// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { advanceDate } from '../../app/services/recurring-schedule.js';

describe('advanceDate (#425)', () => {
    test('weekly adds 7 days', () => {
        expect(advanceDate('2026-01-01', 'weekly')).toBe('2026-01-08');
    });
    test('monthly adds a month', () => {
        expect(advanceDate('2026-01-15', 'monthly')).toBe('2026-02-15');
    });
    test('monthly clamps end-of-month (Jan 31 → Feb 28)', () => {
        expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    });
    test('quarterly adds 3 months', () => {
        expect(advanceDate('2026-01-15', 'quarterly')).toBe('2026-04-15');
    });
    test('yearly rolls the year and handles Feb 29 → Feb 28', () => {
        expect(advanceDate('2028-02-29', 'yearly')).toBe('2029-02-28');
    });
    test('monthly crossing a year boundary', () => {
        expect(advanceDate('2026-12-10', 'monthly')).toBe('2027-01-10');
    });
    test('returns null on bad date or cadence', () => {
        expect(advanceDate('nope', 'monthly')).toBeNull();
        expect(advanceDate('2026-01-01', 'fortnightly')).toBeNull();
    });
});
