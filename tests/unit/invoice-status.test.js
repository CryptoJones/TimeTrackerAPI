// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for invoice status/balance derivation
// (app/services/invoice-status.js). Pure — no DB.

import { describe, test, expect } from 'vitest';

const { deriveStatus, summarize } = require('../../app/services/invoice-status.js');

const TODAY = '2026-07-05';

describe('invoice-status.deriveStatus', () => {
    test("'draft' when the invoice has no total yet", () => {
        expect(deriveStatus({ total: null, amountPaid: 0, dueDate: '2026-08-01', today: TODAY })).toBe('draft');
    });
    test("'paid' when amountPaid meets or exceeds the total", () => {
        expect(deriveStatus({ total: 100, amountPaid: 100, dueDate: '2026-08-01', today: TODAY })).toBe('paid');
        expect(deriveStatus({ total: 100, amountPaid: 120, dueDate: '2026-01-01', today: TODAY })).toBe('paid');
    });
    test("'sent' when totalled, unpaid, and not yet due", () => {
        expect(deriveStatus({ total: 100, amountPaid: 0, dueDate: '2026-08-01', today: TODAY })).toBe('sent');
    });
    test("'partial' when partly paid and not overdue", () => {
        expect(deriveStatus({ total: 100, amountPaid: 40, dueDate: '2026-08-01', today: TODAY })).toBe('partial');
    });
    test("'overdue' when unpaid/partly paid and past the due date", () => {
        expect(deriveStatus({ total: 100, amountPaid: 0, dueDate: '2026-06-01', today: TODAY })).toBe('overdue');
        expect(deriveStatus({ total: 100, amountPaid: 40, dueDate: '2026-06-01', today: TODAY })).toBe('overdue');
    });
    test("due today is not yet overdue", () => {
        expect(deriveStatus({ total: 100, amountPaid: 0, dueDate: TODAY, today: TODAY })).toBe('sent');
    });
});

describe('invoice-status.summarize', () => {
    test('sums allocated payments and computes an exact balance', () => {
        const invoice = { invTotal: 150, invDueDate: '2026-08-01' };
        const payments = [{ cpayAmount: 50 }, { cpayAmount: 25.5 }];
        expect(summarize(invoice, payments, TODAY)).toEqual({
            status: 'partial', total: 150, amountPaid: 75.5, balance: 74.5,
        });
    });
    test('no payments → full balance, status sent', () => {
        expect(summarize({ invTotal: 100, invDueDate: '2026-08-01' }, [], TODAY)).toEqual({
            status: 'sent', total: 100, amountPaid: 0, balance: 100,
        });
    });
    test('fully paid → zero balance, status paid', () => {
        const r = summarize({ invTotal: 100, invDueDate: '2026-08-01' }, [{ cpayAmount: 100 }], TODAY);
        expect(r).toEqual({ status: 'paid', total: 100, amountPaid: 100, balance: 0 });
    });
    test('untotalled invoice → null total/balance, draft', () => {
        const r = summarize({ invTotal: null, invDueDate: '2026-08-01' }, [{ cpayAmount: 10 }], TODAY);
        expect(r).toEqual({ status: 'draft', total: null, amountPaid: 10, balance: null });
    });
    test('no float drift summing many payments', () => {
        const payments = Array.from({ length: 3 }, () => ({ cpayAmount: 0.1 }));
        expect(summarize({ invTotal: 1, invDueDate: '2026-08-01' }, payments, TODAY).amountPaid).toBe(0.3);
    });
});
