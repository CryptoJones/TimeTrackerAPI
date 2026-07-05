// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the exact-money service (app/services/money.js). No DB.

import { describe, test, expect } from 'vitest';

const money = require('../../app/services/money.js');

describe('money.toCents / fromCents', () => {
    test('round-trips whole and fractional amounts', () => {
        expect(money.toCents(0)).toBe(0);
        expect(money.toCents(5)).toBe(500);
        expect(money.toCents(19.99)).toBe(1999);
        expect(money.fromCents(1999)).toBe(19.99);
        expect(money.fromCents(0)).toBe(0);
    });

    test('accepts NUMERIC strings (as pg returns them)', () => {
        expect(money.toCents('19.99')).toBe(1999);
        expect(money.toCents('100.00')).toBe(10000);
    });

    test('rounds half away from zero, symmetric on sign', () => {
        expect(money.toCents(0.005)).toBe(1);
        expect(money.toCents(-0.005)).toBe(-1);
        expect(money.toCents(2.675)).toBe(268); // classic float-repr trap
    });

    test('throws on non-finite / non-numeric input', () => {
        expect(() => money.toCents(NaN)).toThrow(TypeError);
        expect(() => money.toCents(Infinity)).toThrow(TypeError);
        expect(() => money.toCents('abc')).toThrow(TypeError);
        expect(() => money.toCents(null)).toThrow(TypeError);
        expect(() => money.toCents(undefined)).toThrow(TypeError);
    });

    test('fromCents rejects non-integers', () => {
        expect(() => money.fromCents(1.5)).toThrow(TypeError);
    });
});

describe('money.add / subtract — no float drift', () => {
    test('0.1 + 0.2 === 0.3 exactly', () => {
        expect(money.add(0.1, 0.2)).toBe(0.3);
    });

    test('sums a long list of cents exactly', () => {
        const pennies = Array.from({ length: 10 }, () => 0.1);
        expect(money.sum(pennies)).toBe(1);
    });

    test('add() with no args is 0; sum([]) is 0', () => {
        expect(money.add()).toBe(0);
        expect(money.sum([])).toBe(0);
    });

    test('subtract is exact', () => {
        expect(money.subtract(0.3, 0.1)).toBe(0.2);
        expect(money.subtract(100, 0.01)).toBe(99.99);
    });

    test('sum rejects a non-array', () => {
        expect(() => money.sum(19.99)).toThrow(TypeError);
    });
});

describe('money.multiply — rate/hours/quantity', () => {
    test('rate x hours rounds to the cent once', () => {
        expect(money.multiply(100, 1.5)).toBe(150);
        expect(money.multiply(33.33, 3)).toBe(99.99);
        expect(money.multiply(85, 0.25)).toBe(21.25); // 15-minute block
    });

    test('handles fractional-cent products deterministically', () => {
        // 10.00 x 0.333 = 3.33 (3.330 rounds to 3.33)
        expect(money.multiply(10, 0.333)).toBe(3.33);
        // 0.10 x 1.5 = 0.15
        expect(money.multiply(0.1, 1.5)).toBe(0.15);
    });
});

describe('money.round / isEqual / toFixedString', () => {
    test('round strips float noise to 2 dp', () => {
        expect(money.round(0.1 + 0.2)).toBe(0.3);
        expect(money.round(19.999)).toBe(20);
    });

    test('isEqual compares to the cent', () => {
        expect(money.isEqual(0.1 + 0.2, 0.3)).toBe(true);
        expect(money.isEqual(19.99, 19.999)).toBe(false);
    });

    test('toFixedString always has 2 fraction digits', () => {
        expect(money.toFixedString(5)).toBe('5.00');
        expect(money.toFixedString(19.9)).toBe('19.90');
        expect(money.toFixedString('100')).toBe('100.00');
        expect(money.toFixedString(0.1 + 0.2)).toBe('0.30');
    });
});
