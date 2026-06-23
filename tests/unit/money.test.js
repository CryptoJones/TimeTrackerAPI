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

describe('jobBillRate', () => {
    const rateByBt = new Map([[1, 100], [2, 50]]);
    const defByWorker = new Map([[5, 2]]); // worker 5 defaults to billtype 2

    test('uses the entry billing type first', () => {
        expect(money.jobBillRate({ teBillTypeId: 1, teWorkerId: 5 }, rateByBt, defByWorker)).toBe(100);
    });
    test('falls back to the worker default', () => {
        expect(money.jobBillRate({ teBillTypeId: null, teWorkerId: 5 }, rateByBt, defByWorker)).toBe(50);
    });
    test('null when neither resolves', () => {
        expect(money.jobBillRate({ teBillTypeId: null, teWorkerId: null }, rateByBt, defByWorker)).toBeNull();
        expect(money.jobBillRate({ teBillTypeId: 99, teWorkerId: null }, rateByBt, defByWorker)).toBeNull();
    });
});

describe('computeJobBill', () => {
    const rateByBt = new Map([[1, 100], [2, 50]]);
    const defByWorker = new Map([[5, 2]]);

    test('sums hours × rate across entries', () => {
        const entries = [
            { teId: 10, teMinutes: 120, teBillTypeId: 1 }, // 2h × 100 = 200
            { teId: 11, teMinutes: 30, teBillTypeId: 2 },  // 0.5h × 50 = 25
        ];
        const r = money.computeJobBill(entries, rateByBt, defByWorker);
        expect(r.amount).toBe(225);
        expect(r.billedEntryIds).toEqual([10, 11]);
        expect(r.unratedCount).toBe(0);
    });

    test('uses worker default rate when entry has no billing type', () => {
        const entries = [{ teId: 12, teMinutes: 60, teBillTypeId: null, teWorkerId: 5 }];
        const r = money.computeJobBill(entries, rateByBt, defByWorker);
        expect(r.amount).toBe(50);
        expect(r.billedEntryIds).toEqual([12]);
    });

    test('counts unrated entries but does not bill them', () => {
        const entries = [
            { teId: 13, teMinutes: 60, teBillTypeId: 1 },          // billed: 100
            { teId: 14, teMinutes: 60, teBillTypeId: null, teWorkerId: null }, // unrated
        ];
        const r = money.computeJobBill(entries, rateByBt, defByWorker);
        expect(r.amount).toBe(100);
        expect(r.billedEntryIds).toEqual([13]);
        expect(r.unratedCount).toBe(1);
    });

    test('skips zero / null / in-flight minute entries', () => {
        const entries = [
            { teId: 15, teMinutes: 0, teBillTypeId: 1 },
            { teId: 16, teMinutes: null, teBillTypeId: 1 },
            { teId: 17, teMinutes: 60, teBillTypeId: 1 },
        ];
        const r = money.computeJobBill(entries, rateByBt, defByWorker);
        expect(r.amount).toBe(100);
        expect(r.billedEntryIds).toEqual([17]);
    });

    test('empty input → zero', () => {
        expect(money.computeJobBill([], rateByBt, defByWorker)).toEqual({ amount: 0, billedEntryIds: [], unratedCount: 0 });
    });
});
