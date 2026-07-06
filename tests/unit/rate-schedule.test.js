// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { rateOnDate } from '../../app/services/rate-schedule.js';

const SCHEDULES = [
    { effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', rate: 150 },
    { effectiveFrom: '2026-01-01', effectiveTo: null, rate: 175 }, // open-ended current rate
];

describe('rateOnDate (#414)', () => {
    test('picks the rate whose range contains the date', () => {
        expect(rateOnDate(SCHEDULES, '2025-06-15')).toBe(150);
        expect(rateOnDate(SCHEDULES, '2026-06-15')).toBe(175);
    });

    test('open-ended schedule applies to any date on/after its start', () => {
        expect(rateOnDate(SCHEDULES, '2030-01-01')).toBe(175);
    });

    test('returns null before any schedule starts', () => {
        expect(rateOnDate(SCHEDULES, '2024-12-31')).toBeNull();
    });

    test('when several apply, the latest effectiveFrom wins', () => {
        const overlapping = [
            { effectiveFrom: '2026-01-01', effectiveTo: null, rate: 100 },
            { effectiveFrom: '2026-06-01', effectiveTo: null, rate: 200 }, // supersedes from June
        ];
        expect(rateOnDate(overlapping, '2026-03-01')).toBe(100);
        expect(rateOnDate(overlapping, '2026-07-01')).toBe(200);
    });

    test('null date or empty schedules → null', () => {
        expect(rateOnDate(SCHEDULES, null)).toBeNull();
        expect(rateOnDate([], '2026-01-01')).toBeNull();
    });
});
