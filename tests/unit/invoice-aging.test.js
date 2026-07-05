// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for AR aging (app/services/invoice-aging.js). Pure — no DB.

import { describe, test, expect } from 'vitest';

const { buildAging, daysOverdue, bucketFor } = require('../../app/services/invoice-aging.js');

const TODAY = '2026-07-05';

describe('invoice-aging.daysOverdue / bucketFor', () => {
    test('days overdue is today − due (positive when past due)', () => {
        expect(daysOverdue('2026-07-05', TODAY)).toBe(0);
        expect(daysOverdue('2026-07-04', TODAY)).toBe(1);
        expect(daysOverdue('2026-06-05', TODAY)).toBe(30);
        expect(daysOverdue('2026-08-01', TODAY)).toBe(-27); // not yet due
    });
    test('bucket boundaries', () => {
        expect(bucketFor(0)).toBe('current');
        expect(bucketFor(-5)).toBe('current');
        expect(bucketFor(1)).toBe('d1_30');
        expect(bucketFor(30)).toBe('d1_30');
        expect(bucketFor(31)).toBe('d31_60');
        expect(bucketFor(60)).toBe('d31_60');
        expect(bucketFor(61)).toBe('d61_90');
        expect(bucketFor(90)).toBe('d61_90');
        expect(bucketFor(91)).toBe('d90plus');
    });
});

describe('invoice-aging.buildAging', () => {
    test('buckets outstanding balances and totals each bucket exactly', () => {
        const items = [
            { invId: 1, invNumber: 'INV-0001', custName: 'A', dueDate: '2026-08-01', balance: 100 }, // current
            { invId: 2, invNumber: 'INV-0002', custName: 'B', dueDate: '2026-06-20', balance: 50 },  // 15d → d1_30
            { invId: 3, invNumber: 'INV-0003', custName: 'C', dueDate: '2026-06-01', balance: 25.5 },// 34d → d31_60
            { invId: 4, invNumber: 'INV-0004', custName: 'D', dueDate: '2026-01-01', balance: 200 }, // 90+ → d90plus
        ];
        const { buckets, totalOutstanding, invoices } = buildAging(items, TODAY);
        expect(buckets.current).toEqual({ count: 1, amount: 100 });
        expect(buckets.d1_30).toEqual({ count: 1, amount: 50 });
        expect(buckets.d31_60).toEqual({ count: 1, amount: 25.5 });
        expect(buckets.d61_90).toEqual({ count: 0, amount: 0 });
        expect(buckets.d90plus).toEqual({ count: 1, amount: 200 });
        expect(totalOutstanding).toBe(375.5);
        // most overdue first
        expect(invoices.map((i) => i.invId)).toEqual([4, 3, 2, 1]);
    });

    test('skips settled (null / <= 0 balance) invoices', () => {
        const items = [
            { invId: 1, dueDate: '2026-06-01', balance: 0 },
            { invId: 2, dueDate: '2026-06-01', balance: null },
            { invId: 3, dueDate: '2026-06-01', balance: -10 },
            { invId: 4, dueDate: '2026-06-01', balance: 40 },
        ];
        const { totalOutstanding, invoices } = buildAging(items, TODAY);
        expect(totalOutstanding).toBe(40);
        expect(invoices).toHaveLength(1);
        expect(invoices[0].invId).toBe(4);
    });

    test('empty input → zeroed buckets', () => {
        const { buckets, totalOutstanding } = buildAging([], TODAY);
        expect(totalOutstanding).toBe(0);
        expect(buckets.current).toEqual({ count: 0, amount: 0 });
    });
});
