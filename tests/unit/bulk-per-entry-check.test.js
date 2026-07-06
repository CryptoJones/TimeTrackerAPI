// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit coverage for the `perEntryCheck` hook added to makeBulkCreateIndirect
// (_bulk-helpers.js). It runs a per-entry integrity check the parent/secondary
// scope can't express — used by CustomerPayment bulk to enforce the same
// "cpayInvId must be an invoice for the SAME customer" rule the single-create
// path checks (otherwise a batch could allocate a payment to another
// customer's / tenant's invoice). Driven via a master key, which reaches
// perEntryCheck (it runs for every entry) without a company lookup.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        transaction: vi.fn().mockResolvedValue({
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        }),
    },
}));

const auth = require('../../app/middleware/auth.js');
const { makeBulkCreateIndirect } = require('../../app/controllers/_bulk-helpers.js');

beforeEach(() => {
    // isMaster → true via the auth test seam (a truthy ApiMaster row).
    auth._setDbForTesting({ ApiMaster: { findOne: async () => ({ amId: 1 }) } });
});
afterEach(() => auth._setDbForTesting(null));

function fakeRes() {
    return {
        statusCode: null, body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}

function makeHandler(perEntryCheck) {
    return makeBulkCreateIndirect({
        Model: { bulkCreate: vi.fn().mockResolvedValue([{ id: 1 }]) },
        modelKey: 'CustomerPayment',
        parentFkField: 'cpayCustId',
        resolveParentCompanyId: async () => 1,
        allowedFields: ['cpayCustId', 'cpayInvId'],
        archField: 'cpayArch',
        bodyKey: 'customerPayments',
        createdKey: 'customerPayments',
        perEntryCheck,
    });
}

describe('makeBulkCreateIndirect perEntryCheck', () => {
    test('rejects the batch with the entry index when the per-entry check fails', async () => {
        // Mirrors checkInvoiceAllocation returning { status, message } for a
        // cpayInvId that belongs to a different customer.
        const handler = makeHandler((p) => (
            p.cpayInvId === 999
                ? { status: 400, message: 'cpayInvId must reference an invoice for the same customer (cpayCustId).' }
                : null
        ));
        const req = { get: () => 'masterkey', body: { customerPayments: [{ cpayCustId: 10, cpayInvId: 999 }] } };
        const res = fakeRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('customerPayments[0]:');
        expect(res.body.message).toContain('same customer');
    });

    test('does not reject when the per-entry check passes an entry (no error before persist)', async () => {
        // A passing entry must NOT be rejected by the hook — assert the hook
        // itself returns no error for a valid entry (the persist path beyond
        // this needs a live transaction and is covered by the api suite).
        const check = vi.fn().mockResolvedValue(null);
        const handler = makeHandler(check);
        const req = { get: () => 'masterkey', body: { customerPayments: [{ cpayCustId: 10, cpayInvId: 5 }] } };
        const res = fakeRes();
        try { await handler(req, res); } catch (_) { /* persist path needs a live db */ }
        expect(check).toHaveBeenCalledWith(expect.objectContaining({ cpayCustId: 10, cpayInvId: 5 }));
        expect(res.statusCode).not.toBe(400); // the hook did not reject the valid entry
    });
});
