// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { buildProfitability } from '../../app/services/report-profitability.js';

// A billing type carrying an hourly rate, as rate.js expects.
const bt = (r) => ({ btHourlyRate: r });

describe('buildProfitability (#436)', () => {
    test('nets revenue against cost into margin per job', () => {
        // Job 1: 60 min billable @ $200/hr rev, worker cost $80/hr.
        const entries = [
            { teId: 1, teJobId: 1, teMinutes: 60, teBillable: true, billingType: bt(200), worker: { workerCostRate: 80 }, job: { jobDesc: 'Alpha' } },
        ];
        const r = buildProfitability(entries);
        expect(r.jobs).toHaveLength(1);
        const j = r.jobs[0];
        expect(j.revenue).toBe(200);
        expect(j.cost).toBe(80);
        expect(j.margin).toBe(120);
        expect(j.marginPct).toBe(60);
        expect(r.totals.margin).toBe(120);
    });

    test('non-billable time adds cost but no revenue', () => {
        const entries = [
            { teId: 1, teJobId: 1, teMinutes: 60, teBillable: true, billingType: bt(200), worker: { workerCostRate: 80 } },
            { teId: 2, teJobId: 1, teMinutes: 60, teBillable: false, worker: { workerCostRate: 80 } },
        ];
        const r = buildProfitability(entries);
        expect(r.jobs[0].revenue).toBe(200);
        expect(r.jobs[0].cost).toBe(160); // both hours cost
        expect(r.jobs[0].margin).toBe(40);
    });

    test('flags entries with no cost rate and no resolvable revenue rate', () => {
        const entries = [
            { teId: 1, teJobId: 1, teMinutes: 60, teBillable: true, worker: {} }, // no rate, no cost
        ];
        const r = buildProfitability(entries);
        expect(r.unresolvedRateEntryIds).toContain(1);
        expect(r.entriesMissingCostRate).toContain(1);
        expect(r.jobs[0].revenue).toBe(0);
        expect(r.jobs[0].cost).toBe(0);
    });

    test('skips in-flight entries (teMinutes null)', () => {
        const r = buildProfitability([{ teId: 1, teJobId: 1, teMinutes: null, teBillable: true, billingType: bt(200), worker: { workerCostRate: 80 } }]);
        expect(r.jobs).toHaveLength(0);
        expect(r.totals.revenue).toBe(0);
    });
});
