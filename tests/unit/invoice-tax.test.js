// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for invoice tax (app/services/invoice-tax.js).

import { describe, test, expect } from 'vitest';

const { normalizeRate, computeTax, resolveRate } = require('../../app/services/invoice-tax.js');

describe('invoice-tax.normalizeRate', () => {
    test('passes fractions through, clamps out-of-range, zeroes junk', () => {
        expect(normalizeRate(0.0725)).toBe(0.0725);
        expect(normalizeRate('0.1')).toBe(0.1);
        expect(normalizeRate(0)).toBe(0);
        expect(normalizeRate(-1)).toBe(0);
        expect(normalizeRate(2)).toBe(1);
        expect(normalizeRate(NaN)).toBe(0);
        expect(normalizeRate(null)).toBe(0);
    });
});

describe('invoice-tax.computeTax', () => {
    test('tax = subtotal × rate, rounded to the cent', () => {
        expect(computeTax(100, 0.0725)).toBe(7.25);
        expect(computeTax(19.99, 0.1)).toBe(2); // 1.999 → 2.00
        expect(computeTax(200, 0)).toBe(0);
        expect(computeTax(null, 0.1)).toBe(0);
    });
});

describe('invoice-tax.resolveRate', () => {
    test('override wins, then company default, then 0', () => {
        expect(resolveRate({ override: 0.05, companyDefault: 0.0725 })).toBe(0.05);
        expect(resolveRate({ override: null, companyDefault: 0.0725 })).toBe(0.0725);
        expect(resolveRate({ override: null, companyDefault: null })).toBe(0);
        expect(resolveRate({ override: 0 })).toBe(0); // explicit zero override is honored
    });
});
