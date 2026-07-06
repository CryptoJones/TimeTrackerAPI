// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { buildUtilization } from '../../app/services/report-utilization.js';

describe('buildUtilization (#53)', () => {
    test('utilization = billable / capacity over the week span', () => {
        // 2400 min/week target × 2 weeks = 4800 min capacity; 2400 billable → 50%.
        const r = buildUtilization(
            [{ workerId: 1, workerName: 'Ada', targetMinsPerWeek: 2400, billableMins: 2400, totalMins: 3000 }],
            2,
        );
        const w = r.workers[0];
        expect(w.capacityMinutes).toBe(4800);
        expect(w.utilizationPct).toBe(50);
        expect(w.billableRatioPct).toBe(80); // 2400 / 3000
        expect(r.totals.utilizationPct).toBe(50);
    });

    test('a worker with no target has null utilization but a real billable ratio', () => {
        const r = buildUtilization(
            [{ workerId: 2, workerName: 'Bo', targetMinsPerWeek: null, billableMins: 300, totalMins: 600 }],
            1,
        );
        expect(r.workers[0].utilizationPct).toBeNull();
        expect(r.workers[0].billableRatioPct).toBe(50);
        expect(r.totals.utilizationPct).toBeNull(); // no capacity across the team
    });

    test('team totals aggregate across workers', () => {
        const r = buildUtilization([
            { workerId: 1, targetMinsPerWeek: 600, billableMins: 300, totalMins: 600 },
            { workerId: 2, targetMinsPerWeek: 600, billableMins: 600, totalMins: 600 },
        ], 1);
        // capacity 1200, billable 900 → 75%
        expect(r.totals.capacityMinutes).toBe(1200);
        expect(r.totals.utilizationPct).toBe(75);
    });
});
