// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { buildPayroll, hoursFromMinutes } from '../../app/services/payroll.js';

const WORKERS = [
    { workerId: 1, workerFName: 'Jane', workerLName: 'Doe', workerCostRate: 100 },
    { workerId: 2, workerFName: 'Bob', workerLName: 'Roe', workerCostRate: 80 },
    { workerId: 3, workerFName: 'No', workerLName: 'Rate', workerCostRate: null },
];
const ENTRIES = [
    { teWorkerId: 1, teMinutes: 60, teBillable: true },
    { teWorkerId: 1, teMinutes: 30, teBillable: false },
    { teWorkerId: 2, teMinutes: 120, teBillable: true },
    { teWorkerId: 3, teMinutes: 45, teBillable: true },
    { teWorkerId: null, teMinutes: 999, teBillable: true }, // ignored (no worker)
];

describe('payroll (#456)', () => {
    test('hoursFromMinutes rounds to 2 decimals', () => {
        expect(hoursFromMinutes(90)).toBe(1.5);
        expect(hoursFromMinutes(45)).toBe(0.75);
        expect(hoursFromMinutes(0)).toBe(0);
    });

    test('aggregates per worker with billable split and labor cost', () => {
        const { rows, periodStart, periodEnd } = buildPayroll(ENTRIES, WORKERS, { from: '2026-01-01', to: '2026-01-15' });
        expect(periodStart).toBe('2026-01-01');
        expect(periodEnd).toBe('2026-01-15');
        expect(rows).toHaveLength(3);

        const jane = rows.find((r) => r.workerId === 1);
        expect(jane.workerName).toBe('Jane Doe');
        expect(jane.totalMinutes).toBe(90);
        expect(jane.totalHours).toBe(1.5);
        expect(jane.billableHours).toBe(1);
        expect(jane.nonBillableHours).toBe(0.5);
        expect(jane.costTotal).toBe(150);

        const bob = rows.find((r) => r.workerId === 2);
        expect(bob.totalHours).toBe(2);
        expect(bob.costTotal).toBe(160);

        // Worker with no cost rate → null cost, still counted for hours.
        const norate = rows.find((r) => r.workerId === 3);
        expect(norate.costRate).toBeNull();
        expect(norate.costTotal).toBeNull();
        expect(norate.totalHours).toBe(0.75);
    });

    test('labor cost is rate × exact minutes, not rate × the 2-dp display hours (regression)', () => {
        // 50 min @ $100/hr: display hours round to 0.83, but the cost must be
        // 100 × 50/60 = 83.3333 → 83.33 — NOT 0.83 × 100 = 83.00. Computing
        // cost from the pre-rounded hours understated it by $0.33 here, and
        // those errors accumulated in the grand total.
        const workers = [
            { workerId: 1, workerFName: 'A', workerCostRate: 100 },
            { workerId: 2, workerFName: 'B', workerCostRate: 200 },
        ];
        const entries = [
            { teWorkerId: 1, teMinutes: 50, teBillable: true }, // 100 × 50/60 = 83.33
            { teWorkerId: 2, teMinutes: 25, teBillable: true }, // 200 × 25/60 = 83.33
        ];
        const { rows, totals } = buildPayroll(entries, workers);
        const a = rows.find((r) => r.workerId === 1);
        const b = rows.find((r) => r.workerId === 2);
        expect(a.totalHours).toBe(0.83); // display hours stay 2-dp
        expect(a.costTotal).toBe(83.33); // cost derived from exact minutes
        expect(b.costTotal).toBe(83.33);
        expect(totals.costTotal).toBe(166.66);
    });

    test('totals sum hours and known costs; rows sorted by workerId', () => {
        const { rows, totals } = buildPayroll(ENTRIES, WORKERS);
        expect(rows.map((r) => r.workerId)).toEqual([1, 2, 3]);
        expect(totals.workers).toBe(3);
        expect(totals.totalMinutes).toBe(255);
        expect(totals.totalHours).toBe(4.25);
        expect(totals.costTotal).toBe(310); // 150 + 160 (+ null ignored)
    });

    test('empty input yields an empty payroll', () => {
        const { rows, totals } = buildPayroll([], []);
        expect(rows).toEqual([]);
        expect(totals.costTotal).toBe(0);
    });
});
