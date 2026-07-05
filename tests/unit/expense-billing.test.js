// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for expense billing (app/services/expense-billing.js).

import { describe, test, expect } from 'vitest';

const { normalizeMarkup, billableAmount } = require('../../app/services/expense-billing.js');

describe('expense-billing.normalizeMarkup', () => {
    test('passes non-negative through, coerces strings, zeroes junk', () => {
        expect(normalizeMarkup(0.15)).toBe(0.15);
        expect(normalizeMarkup('0.2')).toBe(0.2);
        expect(normalizeMarkup(1.5)).toBe(1.5); // >100% markup is allowed
        expect(normalizeMarkup(0)).toBe(0);
        expect(normalizeMarkup(-0.1)).toBe(0);
        expect(normalizeMarkup(NaN)).toBe(0);
        expect(normalizeMarkup(null)).toBe(0);
    });
});

describe('expense-billing.billableAmount', () => {
    test('non-billable → 0 regardless of markup', () => {
        expect(billableAmount({ expBillable: false, expAmount: 100, expMarkupPct: 0.15 })).toBe(0);
    });
    test('billable at cost when markup is absent/zero', () => {
        expect(billableAmount({ expBillable: true, expAmount: 100, expMarkupPct: null })).toBe(100);
        expect(billableAmount({ expBillable: true, expAmount: 100, expMarkupPct: 0 })).toBe(100);
    });
    test('billable with markup, rounded to the cent', () => {
        expect(billableAmount({ expBillable: true, expAmount: 100, expMarkupPct: 0.15 })).toBe(115);
        expect(billableAmount({ expBillable: true, expAmount: 19.99, expMarkupPct: 0.1 })).toBe(21.99);
    });
    test('null cost → null', () => {
        expect(billableAmount({ expBillable: true, expAmount: null, expMarkupPct: 0.1 })).toBeNull();
    });
});
