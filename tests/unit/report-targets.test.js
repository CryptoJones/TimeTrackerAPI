// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the worker-targets report (app/services/report-targets.js).

import { describe, test, expect } from 'vitest';

const { buildTargets, weeksBetween, statusOf } = require('../../app/services/report-targets.js');

describe('report-targets.statusOf', () => {
    test('under / on / over within a ±10% band; no-target on null', () => {
        expect(statusOf(null)).toBe('no-target');
        expect(statusOf(0.5)).toBe('under');
        expect(statusOf(0.9)).toBe('on');
        expect(statusOf(1)).toBe('on');
        expect(statusOf(1.1)).toBe('on');
        expect(statusOf(1.2)).toBe('over');
        expect(statusOf(0.89)).toBe('under');
    });
});

describe('report-targets.weeksBetween', () => {
    test('counts ISO weeks spanned (inclusive), min 1', () => {
        expect(weeksBetween('2026-07-06', '2026-07-12')).toBe(1); // one Mon–Sun week
        expect(weeksBetween('2026-07-06', '2026-07-13')).toBe(2); // two Mondays
        expect(weeksBetween('2026-07-01', '2026-07-14')).toBe(3); // weeks 06-29, 07-06, 07-13
        expect(weeksBetween(null, '2026-07-14')).toBe(1);
    });
});

describe('report-targets.buildTargets', () => {
    test('scales weekly target by weeks and flags status', () => {
        const r = buildTargets([
            { workerId: 1, workerName: 'W', targetMinsPerWeek: 2400, actualMins: 4800 }, // 40h/wk × 2 = 80h, did 80h → on
            { workerId: 2, workerName: 'V', targetMinsPerWeek: 2400, actualMins: 2000 }, // did far less → under
            { workerId: 3, workerName: 'U', targetMinsPerWeek: null, actualMins: 100 },  // no target
        ], 2);
        expect(r.weeks).toBe(2);
        const a = r.workers.find((x) => x.workerId === 1);
        expect(a.targetHours).toBe(80);
        expect(a.actualHours).toBe(80);
        expect(a.status).toBe('on');
        expect(r.workers.find((x) => x.workerId === 2).status).toBe('under');
        expect(r.workers.find((x) => x.workerId === 3).status).toBe('no-target');
        expect(r.underCount).toBe(1);
    });

    test('empty input → empty report', () => {
        expect(buildTargets([], 1)).toEqual({ weeks: 1, workers: [], count: 0, underCount: 0 });
    });
});
