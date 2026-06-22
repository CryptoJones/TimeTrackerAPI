// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit coverage for the TimeEntry restored-FK cross-tenant guard
// (scopedFkError). The full create/PATCH path needs auth + DB mocks
// that don't compose cleanly with vitest's per-file vi.mock model in
// this codebase, so — like isInvertedRange — we test the guard in
// isolation, driving the auth resolvers through the _setDbForTesting
// seam they already expose.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const auth = require('../../app/middleware/auth.js');
const ctrl = require('../../app/controllers/timeentrycontroller.js');
const { scopedFkError } = ctrl._internals;

// Company 7 owns Job 10, Worker 20, BillingType 30.
// Company 99 owns Job 91. Everything else is unknown (-> -1).
const CALLER_COMPANY = 7;

beforeAll(() => {
    auth._setDbForTesting({
        Job: {
            findByPk: (id) => Promise.resolve(
                Number(id) === 10 ? { jobId: 10, customer: { custCompId: 7 } }
                    : Number(id) === 91 ? { jobId: 91, customer: { custCompId: 99 } }
                        : null,
            ),
        },
        Worker: {
            findByPk: (id) => Promise.resolve(
                Number(id) === 20 ? { workerCompId: 7 } : null,
            ),
        },
        BillingType: {
            findByPk: (id) => Promise.resolve(
                Number(id) === 30 ? { btCompId: 7 } : null,
            ),
        },
    });
});

afterAll(() => {
    auth._setDbForTesting(null);
});

describe('scopedFkError', () => {
    test('null when no FKs are present (minimal payload)', async () => {
        expect(await scopedFkError({}, CALLER_COMPANY)).toBeNull();
    });

    test('null when all present FKs belong to the caller company', async () => {
        const err = await scopedFkError(
            { teJobId: 10, teWorkerId: 20, teBillTypeId: 30 },
            CALLER_COMPANY,
        );
        expect(err).toBeNull();
    });

    test('null when an FK is explicitly null (PATCH detach)', async () => {
        expect(await scopedFkError({ teJobId: null }, CALLER_COMPANY)).toBeNull();
    });

    test('error when a job belongs to another company', async () => {
        const err = await scopedFkError({ teJobId: 91 }, CALLER_COMPANY);
        expect(err).toMatch(/job in a company you do not belong to/i);
    });

    test('error when a worker is unknown (resolver -> -1)', async () => {
        const err = await scopedFkError({ teWorkerId: 9999 }, CALLER_COMPANY);
        expect(err).toMatch(/worker in a company you do not belong to/i);
    });

    test('error when a billing type is out of scope', async () => {
        const err = await scopedFkError({ teBillTypeId: 9999 }, CALLER_COMPANY);
        expect(err).toMatch(/billing type in a company you do not belong to/i);
    });

    test('reports the first out-of-scope FK (job before worker)', async () => {
        const err = await scopedFkError(
            { teJobId: 91, teWorkerId: 9999 },
            CALLER_COMPANY,
        );
        expect(err).toMatch(/job/i);
    });
});
