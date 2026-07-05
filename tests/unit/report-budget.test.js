// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the budget-vs-actuals report (app/services/report-budget.js).

import { describe, test, expect } from 'vitest';

const { buildBudget, ratioOf, statusOf } = require('../../app/services/report-budget.js');

describe('report-budget.statusOf', () => {
    test('under / near / over thresholds; no-budget on null', () => {
        expect(statusOf(null)).toBe('no-budget');
        expect(statusOf(0.5)).toBe('under');
        expect(statusOf(0.8)).toBe('near');
        expect(statusOf(1)).toBe('near');
        expect(statusOf(1.01)).toBe('over');
    });
    test('ratioOf guards a zero/absent budget', () => {
        expect(ratioOf(10, null)).toBeNull();
        expect(ratioOf(10, 0)).toBeNull();
        expect(ratioOf(90, 60)).toBe(1.5);
    });
});

describe('report-budget.buildBudget', () => {
    test('per-job hours + amount status vs budget', () => {
        const r = buildBudget([
            { jobId: 1, jobDesc: 'A', budgetMinutes: 600, budgetAmount: 1000, actualMinutes: 660, actualAmount: 900 },
            { jobId: 2, jobDesc: 'B', budgetMinutes: 600, budgetAmount: null, actualMinutes: 300, actualAmount: 0 },
        ]);
        const a = r.jobs.find((j) => j.jobId === 1);
        expect(a.budgetHours).toBe(10);
        expect(a.actualHours).toBe(11);
        expect(a.hoursStatus).toBe('over');       // 660/600 = 1.1
        expect(a.amountStatus).toBe('near');       // 900/1000 = 0.9
        const b = r.jobs.find((j) => j.jobId === 2);
        expect(b.hoursStatus).toBe('under');       // 300/600 = 0.5
        expect(b.amountStatus).toBe('no-budget');  // no amount budget
        expect(r.overCount).toBe(1);
        expect(r.count).toBe(2);
    });

    test('empty input → empty report', () => {
        expect(buildBudget([])).toEqual({ jobs: [], count: 0, overCount: 0 });
    });
});
