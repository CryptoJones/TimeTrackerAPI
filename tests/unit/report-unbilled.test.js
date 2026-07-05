// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the unbilled-time report aggregation
// (app/services/report-unbilled.js). Pure — plain objects.

import { describe, test, expect } from 'vitest';

const { buildUnbilled } = require('../../app/services/report-unbilled.js');

// billable entry: minutes at a per-entry hourly rate, on a customer/job.
const e = (teId, teCustId, custName, teJobId, jobDesc, teMinutes, hourly, teBillable = true) => ({
    teId, teCustId, custName, teJobId, jobDesc, teMinutes, teBillable,
    billingType: hourly == null ? null : { btHourlyRate: hourly },
});

describe('report-unbilled.buildUnbilled', () => {
    test('groups customer → job, sums minutes/hours/amount exactly', () => {
        const r = buildUnbilled([
            e(1, 100, 'Acme', 10, 'Build', 60, 100),   // $100 / 1h
            e(2, 100, 'Acme', 10, 'Build', 30, 100),   // $50 / 0.5h → job 10: $150 / 1.5h
            e(3, 100, 'Acme', 11, 'Design', 90, 80),   // $120 / 1.5h
            e(4, 200, 'Beta', 20, 'Audit', 120, 50),   // $100 / 2h
        ]);
        expect(r.totalAmount).toBe(370);
        expect(r.totalMinutes).toBe(300);
        expect(r.totalHours).toBe(5);
        const acme = r.customers.find((c) => c.custId === 100);
        expect(acme.amount).toBe(270);
        expect(acme.hours).toBe(3);
        expect(acme.jobs.map((j) => [j.jobId, j.amount, j.hours, j.entryCount])).toEqual([
            [10, 150, 1.5, 2],
            [11, 120, 1.5, 1],
        ]);
    });

    test('skips non-billable, job-less, and unresolved-rate entries', () => {
        const r = buildUnbilled([
            e(1, 1, 'A', 5, 'J', 60, 100),
            e(2, 1, 'A', 5, 'J', 60, 100, false), // non-billable
            e(3, 1, 'A', null, null, 60, 100),    // no job
            e(4, 1, 'A', 5, 'J', 60, null),       // no rate
        ]);
        expect(r.totalAmount).toBe(100);
        expect(r.unresolvedRate).toEqual([4]);
        expect(r.customers).toHaveLength(1);
    });

    test('empty input → zero totals', () => {
        const r = buildUnbilled([]);
        expect(r).toEqual({ customers: [], totalMinutes: 0, totalHours: 0, totalAmount: 0, unresolvedRate: [] });
    });
});
