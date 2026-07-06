// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the rate-resolution service (app/services/rate.js).
// Pure functions — plain objects stand in for eager-loaded models.

import { describe, test, expect } from 'vitest';

const rate = require('../../app/services/rate.js');

const bt = (r) => ({ btHourlyRate: r });

describe('rate.resolveHourlyRate — precedence', () => {
    test("entry's own BillingType wins over the worker default", () => {
        const entry = { billingType: bt(150), worker: { defaultBillingType: bt(100) } };
        expect(rate.resolveHourlyRate(entry)).toBe(150);
    });

    test('falls back to the worker default when there is no per-entry rate', () => {
        const entry = { billingType: null, worker: { defaultBillingType: bt(100) } };
        expect(rate.resolveHourlyRate(entry)).toBe(100);
    });

    test("entry's own BillingType wins over the project flat rate", () => {
        const entry = { billingType: bt(150), job: { jobFlatRate: 200 }, worker: { defaultBillingType: bt(100) } };
        expect(rate.resolveHourlyRate(entry)).toBe(150);
    });

    test('project flat rate wins over the worker default', () => {
        const entry = { billingType: null, job: { jobFlatRate: 200 }, worker: { defaultBillingType: bt(100) } };
        expect(rate.resolveHourlyRate(entry)).toBe(200);
    });

    test('project flat rate wins over the client rate', () => {
        expect(rate.resolveHourlyRate({ job: { jobFlatRate: 200 }, customer: { custDefaultRate: 175 } })).toBe(200);
    });

    test('client rate wins over the worker default', () => {
        const entry = { job: { jobFlatRate: null }, customer: { custDefaultRate: 175 }, worker: { defaultBillingType: bt(100) } };
        expect(rate.resolveHourlyRate(entry)).toBe(175);
    });

    test('falls through a null client rate to the worker default', () => {
        const entry = { customer: { custDefaultRate: null }, worker: { defaultBillingType: bt(100) } };
        expect(rate.resolveHourlyRate(entry)).toBe(100);
    });

    test('falls through a null project flat rate to the worker default', () => {
        const entry = { billingType: null, job: { jobFlatRate: null }, worker: { defaultBillingType: bt(100) } };
        expect(rate.resolveHourlyRate(entry)).toBe(100);
    });

    test('coerces a NUMERIC-string project flat rate', () => {
        expect(rate.resolveHourlyRate({ job: { jobFlatRate: '175.00' } })).toBe(175);
    });

    test('null when neither a per-entry nor a worker rate is present', () => {
        expect(rate.resolveHourlyRate({ billingType: null, worker: null })).toBeNull();
        expect(rate.resolveHourlyRate({})).toBeNull();
        expect(rate.resolveHourlyRate(null)).toBeNull();
    });

    test('coerces a NUMERIC string rate (as pg may return it)', () => {
        expect(rate.resolveHourlyRate({ billingType: bt('85.50') })).toBe(85.5);
    });

    test('ignores a non-finite rate and falls through', () => {
        const entry = { billingType: bt(NaN), worker: { defaultBillingType: bt(120) } };
        expect(rate.resolveHourlyRate(entry)).toBe(120);
    });
});

describe('rate.billableAmount', () => {
    test('non-billable entry contributes 0 regardless of rate', () => {
        const entry = { teBillable: false, teMinutes: 120, billingType: bt(100) };
        expect(rate.billableAmount(entry)).toBe(0);
    });

    test('billable with rate + minutes → rate × hours, rounded to the cent', () => {
        expect(rate.billableAmount({ teBillable: true, teMinutes: 60, billingType: bt(100) })).toBe(100);
        expect(rate.billableAmount({ teBillable: true, teMinutes: 90, billingType: bt(100) })).toBe(150);
        expect(rate.billableAmount({ teBillable: true, teMinutes: 15, billingType: bt(85) })).toBe(21.25);
        // 20 min at $99/hr = $33.00 exactly (no float drift)
        expect(rate.billableAmount({ teBillable: true, teMinutes: 20, billingType: bt(99) })).toBe(33);
    });

    test('billable but unresolvable rate → null', () => {
        expect(rate.billableAmount({ teBillable: true, teMinutes: 60, billingType: null, worker: null })).toBeNull();
    });

    test('billable but no minutes (in-flight) → null', () => {
        expect(rate.billableAmount({ teBillable: true, teMinutes: null, billingType: bt(100) })).toBeNull();
    });

    test('honours an explicitly passed-in rate', () => {
        expect(rate.billableAmount({ teBillable: true, teMinutes: 30 }, 200)).toBe(100);
    });
});
