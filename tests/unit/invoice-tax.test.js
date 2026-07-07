// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for invoice tax (app/services/invoice-tax.js).

import { describe, test, expect } from 'vitest';

const { normalizeRate, computeTax, resolveRate, composeTotals } = require('../../app/services/invoice-tax.js');

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

describe('invoice-tax.composeTotals — the discount→tax→total order of operations', () => {
    test('tax is charged on the POST-discount base, not the raw subtotal', () => {
        // 1000 − 200 discount = 800 taxable; 10% → 80 tax (NOT 100 on the 1000).
        expect(composeTotals(1000, 200, 0.1)).toEqual({ discount: 200, taxableBase: 800, tax: 80, total: 880 });
    });

    test('no discount → tax on the full subtotal', () => {
        expect(composeTotals(1000, 0, 0.1)).toEqual({ discount: 0, taxableBase: 1000, tax: 100, total: 1100 });
        // A missing/undefined discount behaves as 0.
        expect(composeTotals(1000, undefined, 0.1)).toEqual({ discount: 0, taxableBase: 1000, tax: 100, total: 1100 });
    });

    test('a discount larger than the subtotal is clamped so the total never goes negative', () => {
        expect(composeTotals(500, 900, 0.1)).toEqual({ discount: 500, taxableBase: 0, tax: 0, total: 0 });
    });

    test('a negative / junk discount is treated as 0', () => {
        expect(composeTotals(1000, -50, 0.2)).toEqual({ discount: 0, taxableBase: 1000, tax: 200, total: 1200 });
        expect(composeTotals(1000, 'nope', 0)).toEqual({ discount: 0, taxableBase: 1000, tax: 0, total: 1000 });
    });

    test('a null subtotal composes to all zeros', () => {
        expect(composeTotals(null, 100, 0.1)).toEqual({ discount: 0, taxableBase: 0, tax: 0, total: 0 });
    });
});
