// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { buildCapacity, weeksBetween, hoursFromMinutes } from '../../app/services/capacity.js';

const WORKERS = [
    { workerId: 1, workerFName: 'Jane', workerLName: 'Doe', workerTargetMinsPerWeek: 2400 }, // 40h/wk
    { workerId: 2, workerFName: 'Bob', workerLName: 'Roe', workerTargetMinsPerWeek: null },  // no target
    { workerId: 3, workerFName: 'Zoe', workerLName: 'Poe', workerTargetMinsPerWeek: 1200 },  // 20h/wk
];
const ENTRIES = [
    { teWorkerId: 1, teMinutes: 3000 }, // 50h
    { teWorkerId: 3, teMinutes: 600 },  // 10h
    { teWorkerId: 2, teMinutes: 300 },  // 5h (no target)
    { teWorkerId: null, teMinutes: 99 }, // ignored
];

describe('capacity (#459)', () => {
    test('weeksBetween counts inclusive days / 7', () => {
        expect(weeksBetween('2026-01-01', '2026-01-14')).toBe(2); // 14 days
        expect(weeksBetween('2026-01-01', '2026-01-07')).toBe(1); // 7 days
        expect(weeksBetween('2026-01-10', '2026-01-01')).toBe(0); // reversed
    });

    test('hoursFromMinutes rounds to 2 decimals', () => {
        expect(hoursFromMinutes(90)).toBe(1.5);
    });

    test('per-worker target vs logged, utilization, remaining (all workers listed)', () => {
        const { rows, weeks, totals } = buildCapacity(ENTRIES, WORKERS, { from: '2026-01-01', to: '2026-01-14', weeks: 2 });
        expect(weeks).toBe(2);
        expect(rows).toHaveLength(3);

        const jane = rows.find((r) => r.workerId === 1);
        expect(jane.targetHours).toBe(80);   // 2400*2 min = 4800 → 80h
        expect(jane.loggedHours).toBe(50);
        expect(jane.remainingHours).toBe(30);
        expect(jane.utilizationPct).toBe(62.5);

        const bob = rows.find((r) => r.workerId === 2); // no target
        expect(bob.targetHours).toBeNull();
        expect(bob.remainingHours).toBeNull();
        expect(bob.utilizationPct).toBeNull();
        expect(bob.loggedHours).toBe(5);

        const zoe = rows.find((r) => r.workerId === 3);
        expect(zoe.targetHours).toBe(40);
        expect(zoe.utilizationPct).toBe(25);

        // Totals: targets 80+40=120h; logged 50+5+10=65h; util 65/120.
        expect(totals.targetHours).toBe(120);
        expect(totals.loggedHours).toBe(65);
        expect(totals.utilizationPct).toBe(54.2);
    });

    test('a worker with no logged time shows full remaining capacity', () => {
        const { rows } = buildCapacity([], [WORKERS[0]], { weeks: 1 });
        expect(rows[0].loggedHours).toBe(0);
        expect(rows[0].targetHours).toBe(40);
        expect(rows[0].remainingHours).toBe(40);
        expect(rows[0].utilizationPct).toBe(0);
    });

    test('weeksBetween returns 0 for a reversed or invalid range', () => {
        expect(weeksBetween('2026-01-08', '2026-01-01')).toBe(0); // to < from
        expect(weeksBetween('not-a-date', '2026-01-08')).toBe(0); // unparseable
        expect(weeksBetween('2026-01-01', '2026-01-01')).toBe(0.14); // 1 inclusive day / 7
    });

    test('an untargeted worker: null target/remaining/utilization, but logged time still counts', () => {
        const { rows } = buildCapacity(
            [{ teWorkerId: 2, teMinutes: 300 }], [WORKERS[1]], { weeks: 1 },
        );
        expect(rows[0].targetHours).toBeNull();
        expect(rows[0].remainingHours).toBeNull();
        expect(rows[0].utilizationPct).toBeNull(); // pct(x, null) → null
        expect(rows[0].loggedHours).toBe(5);
    });

    test('a null teWorkerId entry is ignored', () => {
        const { totals } = buildCapacity(
            [{ teWorkerId: null, teMinutes: 600 }], [WORKERS[0]], { weeks: 1 },
        );
        expect(totals.loggedHours).toBe(0); // the orphan entry contributed nothing
    });

    test('team totals: an untargeted worker inflates utilization (item 12 semantic, may exceed 100%)', () => {
        // Targeted capacity = worker1 (40h) + worker3 (20h) = 60h @ 1 week.
        // Logged = 50 + 10 + 5 = 65h, where worker2's 5h has NO matching target.
        const { totals } = buildCapacity(ENTRIES, WORKERS, { weeks: 1 });
        expect(totals.targetHours).toBe(60);           // only targeted workers
        expect(totals.loggedHours).toBe(65);           // ALL logged, incl. untargeted
        expect(totals.utilizationPct).toBe(108.3);     // 65/60 — exceeds 100% by design
    });
});
