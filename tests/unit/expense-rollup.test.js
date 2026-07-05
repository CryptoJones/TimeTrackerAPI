// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the expense roll-up (app/services/expense-rollup.js).

import { describe, test, expect } from 'vitest';

const { buildExpenseRollup } = require('../../app/services/expense-rollup.js');

const exp = (expId, expBillable, expAmount, expMarkupPct, expCategory) =>
    ({ expId, expBillable, expAmount, expMarkupPct, expCategory, expDescription: null });

describe('expense-rollup.buildExpenseRollup', () => {
    test('prices billable expenses (cost + markup) and sums exactly', () => {
        const r = buildExpenseRollup([
            exp(1, true, 100, 0.15, 'Travel'), // 115
            exp(2, true, 50, 0, 'Meals'),      // 50
            exp(3, true, 19.99, 0.1, 'Parking'), // 21.99
        ]);
        expect(r.lines.map((l) => [l.expId, l.amount, l.category])).toEqual([
            [1, 115, 'Travel'],
            [2, 50, 'Meals'],
            [3, 21.99, 'Parking'],
        ]);
        expect(r.subtotal).toBe(186.99);
        expect(r.skipped.nonBillable).toEqual([]);
    });

    test('skips non-billable and unknown-cost expenses', () => {
        const r = buildExpenseRollup([
            exp(1, true, 100, 0, 'Travel'),
            exp(2, false, 200, 0, 'Personal'), // non-billable → 0
            exp(3, true, null, 0, 'Broken'),   // null cost
        ]);
        expect(r.subtotal).toBe(100);
        expect(r.skipped.nonBillable.sort()).toEqual([2, 3]);
        expect(r.lines).toHaveLength(1);
    });

    test('empty input → zero subtotal', () => {
        expect(buildExpenseRollup([])).toEqual({ lines: [], subtotal: 0, skipped: { nonBillable: [] } });
    });
});
