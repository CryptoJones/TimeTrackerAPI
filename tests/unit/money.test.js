// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit coverage for the invoicing money module. This is the arithmetic
// that partial-payment / balance / status all derive from, so it's
// tested exhaustively in isolation.

import { describe, test, expect } from 'vitest';

const money = require('../../app/services/money.js');

describe('roundCents', () => {
    test('rounds to 2 decimals', () => {
        expect(money.roundCents(1.005)).toBe(1.01);
        expect(money.roundCents(2.344)).toBe(2.34);
        expect(money.roundCents(2.345)).toBe(2.35);
        expect(money.roundCents(10)).toBe(10);
    });
    test('guards NaN / Infinity / junk to 0', () => {
        expect(money.roundCents(NaN)).toBe(0);
        expect(money.roundCents(Infinity)).toBe(0);
        expect(money.roundCents('abc')).toBe(0);
        expect(money.roundCents(undefined)).toBe(0);
    });
    test('parses numeric strings', () => {
        expect(money.roundCents('12.5')).toBe(12.5);
    });
});

describe('invoiceTotal / invoicePaid', () => {
    test('sums line amounts to the cent', () => {
        expect(money.invoiceTotal([
            { injbAmount: 100.1 }, { injbAmount: 50.05 }, { injbAmount: 0.01 },
        ])).toBe(150.16);
    });
    test('sums payments to the cent', () => {
        expect(money.invoicePaid([
            { cpayAmount: 33.33 }, { cpayAmount: 33.33 }, { cpayAmount: 33.34 },
        ])).toBe(100);
    });
    test('empty / missing list is 0', () => {
        expect(money.invoiceTotal([])).toBe(0);
        expect(money.invoiceTotal(undefined)).toBe(0);
        expect(money.invoicePaid(null)).toBe(0);
    });
    test('no float drift over many small amounts', () => {
        const lines = Array.from({ length: 10 }, () => ({ injbAmount: 0.1 }));
        expect(money.invoiceTotal(lines)).toBe(1); // not 0.9999999999999999
    });
});

describe('invoiceBalance', () => {
    test('total minus paid', () => {
        expect(money.invoiceBalance(150.16, 100)).toBe(50.16);
        expect(money.invoiceBalance(100, 100)).toBe(0);
        expect(money.invoiceBalance(100, 120)).toBe(-20); // overpayment
    });
    test('never returns -0', () => {
        expect(Object.is(money.invoiceBalance(100, 100), -0)).toBe(false);
    });
});

describe('deriveStatus', () => {
    test("'paid' when fully covered", () => {
        expect(money.deriveStatus({ total: 100, paid: 100, currentStatus: 'sent' })).toBe('paid');
        expect(money.deriveStatus({ total: 100, paid: 120, currentStatus: 'sent' })).toBe('paid');
    });
    test("'partial' when some money in", () => {
        expect(money.deriveStatus({ total: 100, paid: 40, currentStatus: 'sent' })).toBe('partial');
    });
    test('keeps the manual lifecycle state when nothing is paid', () => {
        expect(money.deriveStatus({ total: 100, paid: 0, currentStatus: 'draft' })).toBe('draft');
        expect(money.deriveStatus({ total: 100, paid: 0, currentStatus: 'sent' })).toBe('sent');
    });
    test("'void' is sticky", () => {
        expect(money.deriveStatus({ total: 100, paid: 100, currentStatus: 'void' })).toBe('void');
    });
    test('zero-total invoice is not auto-paid', () => {
        expect(money.deriveStatus({ total: 0, paid: 0, currentStatus: 'draft' })).toBe('draft');
    });
});

describe('summarize', () => {
    test('builds the full money summary', () => {
        const out = money.summarize(
            { invStatus: 'sent' },
            [{ injbAmount: 80 }, { injbAmount: 20 }],
            [{ cpayAmount: 60 }],
        );
        expect(out).toEqual({ total: 100, paid: 60, balance: 40, status: 'partial' });
    });
    test('tolerates missing lines/payments', () => {
        const out = money.summarize({ invStatus: 'draft' }, undefined, undefined);
        expect(out).toEqual({ total: 0, paid: 0, balance: 0, status: 'draft' });
    });
});
