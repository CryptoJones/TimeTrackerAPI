// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the time→invoice roll-up aggregation
// (app/services/invoice-rollup.js). Pure — plain objects stand in for
// eager-loaded time-entry rows.

import { describe, test, expect } from 'vitest';

const { buildRollup } = require('../../app/services/invoice-rollup.js');

// A billable entry helper: minutes at a per-entry rate, on a job.
const entry = (teId, teJobId, teMinutes, hourly, teBillable = true) => ({
    teId, teJobId, teMinutes, teBillable,
    billingType: hourly == null ? null : { btHourlyRate: hourly },
});

describe('invoice-rollup.buildRollup', () => {
    test('groups entries by job and sums each line (exact money)', () => {
        const { lines, subtotal } = buildRollup([
            entry(1, 10, 60, 100),   // $100.00
            entry(2, 10, 30, 100),   // $50.00  → job 10 = $150.00
            entry(3, 20, 15, 80),    // $20.00  → job 20 = $20.00
        ]);
        expect(lines).toEqual([
            { jobId: 10, amount: 150, entryIds: [1, 2] },
            { jobId: 20, amount: 20, entryIds: [3] },
        ]);
        expect(subtotal).toBe(170);
    });

    test('lines are ordered by jobId ascending regardless of input order', () => {
        const { lines } = buildRollup([entry(1, 30, 60, 10), entry(2, 5, 60, 10)]);
        expect(lines.map((l) => l.jobId)).toEqual([5, 30]);
    });

    test('skips non-billable, job-less, and unresolved-rate entries', () => {
        const { lines, subtotal, skipped } = buildRollup([
            entry(1, 10, 60, 100),                 // billable → counts
            entry(2, 10, 60, 100, false),          // non-billable
            entry(3, null, 60, 100),               // no job
            entry(4, 10, 60, null),                // no rate resolvable
        ]);
        expect(lines).toEqual([{ jobId: 10, amount: 100, entryIds: [1] }]);
        expect(subtotal).toBe(100);
        expect(skipped.nonBillable).toEqual([2]);
        expect(skipped.noJob).toEqual([3]);
        expect(skipped.unresolvedRate).toEqual([4]);
    });

    test('no fractional-cent drift when summing many entries', () => {
        // three 20-minute blocks at $99/hr = $33.00 each → $99.00 exact
        const { subtotal } = buildRollup([
            entry(1, 1, 20, 99), entry(2, 1, 20, 99), entry(3, 1, 20, 99),
        ]);
        expect(subtotal).toBe(99);
    });

    test('empty / all-skipped input yields no lines and a zero subtotal', () => {
        expect(buildRollup([])).toEqual({
            lines: [], subtotal: 0,
            skipped: { nonBillable: [], noJob: [], unresolvedRate: [] },
        });
    });
});
