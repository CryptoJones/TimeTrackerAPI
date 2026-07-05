// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the hours-summary report (app/services/report-hours.js).

import { describe, test, expect } from 'vitest';

const { buildHours } = require('../../app/services/report-hours.js');

const e = (teMinutes, teBillable, teCustId, custName, teJobId, jobDesc, teWorkerId, workerName) =>
    ({ teMinutes, teBillable, teCustId, custName, teJobId, jobDesc, teWorkerId, workerName });

describe('report-hours.buildHours', () => {
    test('totals + billable/non-billable split', () => {
        const r = buildHours([
            e(60, true, 1, 'A', 10, 'J1', 5, 'Wanda'),
            e(30, false, 1, 'A', 10, 'J1', 5, 'Wanda'),
            e(120, true, 2, 'B', 20, 'J2', 6, 'Vic'),
        ]);
        expect(r.totalMinutes).toBe(210);
        expect(r.totalHours).toBe(3.5);
        expect(r.billableMinutes).toBe(180);
        expect(r.nonBillableMinutes).toBe(30);
        expect(r.nonBillableHours).toBe(0.5);
    });

    test('groups by customer, job, and worker with per-group hours', () => {
        const r = buildHours([
            e(60, true, 1, 'A', 10, 'J1', 5, 'Wanda'),
            e(60, false, 1, 'A', 11, 'J2', 5, 'Wanda'),
            e(30, true, 2, 'B', 10, 'J1', 6, 'Vic'),
        ]);
        expect(r.byCustomer).toEqual([
            { custId: 1, custName: 'A', minutes: 120, hours: 2, billableMinutes: 60, billableHours: 1 },
            { custId: 2, custName: 'B', minutes: 30, hours: 0.5, billableMinutes: 30, billableHours: 0.5 },
        ]);
        expect(r.byWorker.find((w) => w.workerId === 5)).toEqual({
            workerId: 5, workerName: 'Wanda', minutes: 120, hours: 2, billableMinutes: 60, billableHours: 1,
        });
        expect(r.byJob.find((j) => j.jobId === 10)).toEqual({
            jobId: 10, jobDesc: 'J1', minutes: 90, hours: 1.5, billableMinutes: 90, billableHours: 1.5,
        });
    });

    test('skips in-flight entries (null minutes) and null-dimension keys', () => {
        const r = buildHours([
            e(null, true, 1, 'A', 10, 'J1', 5, 'W'), // in-flight → skipped
            e(60, true, 1, 'A', null, null, null, null), // counts in totals + customer, not job/worker
        ]);
        expect(r.totalMinutes).toBe(60);
        expect(r.byCustomer).toHaveLength(1);
        expect(r.byJob).toHaveLength(0);
        expect(r.byWorker).toHaveLength(0);
    });
});
