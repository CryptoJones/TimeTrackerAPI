// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit coverage for the reporting controller's scope resolver + row
// mapper. resolveScope is the auth boundary for every report endpoint;
// mapRow is the v_InvoiceList projection. Both are tested in isolation
// (the auth resolvers run through the _setDbForTesting seam) rather than
// via supertest, matching the codebase's pattern for auth-dependent
// controller internals.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const auth = require('../../app/middleware/auth.js');
const ctrl = require('../../app/controllers/reportcontroller.js');
const { resolveScope, mapRow } = ctrl._internals;

// master-key hashes to a master row; scoped-7 hashes to company 7.
beforeAll(() => {
    auth._setDbForTesting({
        ApiMaster: {
            findOne: ({ where }) => Promise.resolve(
                where.amKEY === auth.hashKey('master-key') ? { amId: 1 } : null,
            ),
        },
        ApiKey: {
            findOne: ({ where }) => Promise.resolve(
                where.akKEY === auth.hashKey('scoped-7') ? { akCompanyId: 7 } : null,
            ),
        },
    });
});

afterAll(() => {
    auth._setDbForTesting(null);
});

function fakeReq(authKey, query = {}) {
    return {
        get: (h) => (h === 'authKey' ? authKey : undefined),
        query,
    };
}

describe('reportcontroller.resolveScope', () => {
    test('403 when authKey header is missing', async () => {
        const r = await resolveScope(fakeReq(undefined));
        expect(r.status).toBe(403);
        expect(r.message).toMatch(/not sent/i);
    });

    test('403 for an unknown (non-master, non-scoped) key', async () => {
        const r = await resolveScope(fakeReq('nobody'));
        expect(r.status).toBe(403);
        expect(r.message).toMatch(/invalid/i);
    });

    test('non-master key is auto-scoped to its own company', async () => {
        const r = await resolveScope(fakeReq('scoped-7'));
        expect(r).toEqual({ companyId: 7 });
    });

    test('non-master may pass its own companyId', async () => {
        const r = await resolveScope(fakeReq('scoped-7', { companyId: '7' }));
        expect(r).toEqual({ companyId: 7 });
    });

    test('403 when non-master asks for another company', async () => {
        const r = await resolveScope(fakeReq('scoped-7', { companyId: '99' }));
        expect(r.status).toBe(403);
        expect(r.message).toMatch(/do not belong/i);
    });

    test('master key without companyId is 400', async () => {
        const r = await resolveScope(fakeReq('master-key'));
        expect(r.status).toBe(400);
        expect(r.message).toMatch(/must specify companyId/i);
    });

    test('master key with companyId scopes to that company', async () => {
        const r = await resolveScope(fakeReq('master-key', { companyId: '42' }));
        expect(r).toEqual({ companyId: 42 });
    });
});

describe('reportcontroller.mapRow', () => {
    test('flattens an InvoiceJob+invoice into the v_InvoiceList shape', () => {
        const out = mapRow({
            injbId: 11,
            injbAmount: 250.5,
            invoice: { invId: 5, invDate: '2026-01-15', invCustId: 3 },
        });
        expect(out).toEqual({
            invoiceDate: '2026-01-15',
            invoiceNumber: 5,
            invoiceAmount: 250.5,
            customerId: 3,
        });
    });

    test('tolerates a missing invoice association (defensive)', () => {
        const out = mapRow({ injbAmount: 10 });
        expect(out).toEqual({
            invoiceDate: undefined,
            invoiceNumber: undefined,
            invoiceAmount: 10,
            customerId: undefined,
        });
    });
});
