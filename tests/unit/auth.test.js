// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the shared auth middleware helpers.
//
// P5-M added a `_setDbForTesting(stub)` seam to `app/middleware/auth.js`
// so tests can drive the model-method success paths that vitest's
// vi.mock cannot reliably intercept through this codebase's CJS
// require chains. Each test installs a per-call stub via the setter,
// invokes the helper, and asserts behavior.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn(), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    ApiMaster: {}, ApiKey: {}, Customer: {},
    PurchaseOrderVendor: {}, PurchaseOrderHeader: {}, Job: {},
}));

let auth;
let stub;

beforeEach(async () => {
    auth = await import('../../app/middleware/auth.js');
    stub = {
        ApiMaster: { findOne: vi.fn() },
        ApiKey: { findOne: vi.fn() },
        Customer: { findByPk: vi.fn() },
        PurchaseOrderVendor: { findByPk: vi.fn() },
        PurchaseOrderHeader: { findByPk: vi.fn() },
        Job: { findByPk: vi.fn() },
        InventoryItem: { findByPk: vi.fn() },
        Invoice: { findByPk: vi.fn() },
    };
    auth._setDbForTesting(stub);
});

afterEach(() => {
    if (auth && auth._setDbForTesting) auth._setDbForTesting(null);
});

describe('auth.isMaster', () => {
    test('returns false for empty / missing input (no DB call made)', async () => {
        expect(await auth.isMaster('')).toBe(false);
        expect(await auth.isMaster(null)).toBe(false);
        expect(await auth.isMaster(undefined)).toBe(false);
        expect(stub.ApiMaster.findOne).not.toHaveBeenCalled();
    });

    test('returns false when no row matches', async () => {
        stub.ApiMaster.findOne.mockResolvedValueOnce(null);
        expect(await auth.isMaster('some-key')).toBe(false);
    });

    test('returns TRUE when a real ApiMaster row is found', async () => {
        stub.ApiMaster.findOne.mockResolvedValueOnce({ amId: 42 });
        expect(await auth.isMaster('valid-master-key')).toBe(true);
        // Confirm the lookup was scoped by the hashed key, not the raw value.
        const call = stub.ApiMaster.findOne.mock.calls[0][0];
        expect(call.where.amKEY).toBe(auth.hashKey('valid-master-key'));
    });

    test('returns false when amId is zero or non-numeric', async () => {
        stub.ApiMaster.findOne.mockResolvedValueOnce({ amId: 0 });
        expect(await auth.isMaster('k')).toBe(false);
        stub.ApiMaster.findOne.mockResolvedValueOnce({ amId: 'oops' });
        expect(await auth.isMaster('k')).toBe(false);
    });

    test('swallows DB errors and returns false', async () => {
        stub.ApiMaster.findOne.mockRejectedValueOnce(new Error('connection refused'));
        expect(await auth.isMaster('k')).toBe(false);
    });
});

describe('auth.getCompanyId', () => {
    test('returns -1 for empty input', async () => {
        expect(await auth.getCompanyId('')).toBe(-1);
        expect(await auth.getCompanyId(null)).toBe(-1);
    });

    test('returns -1 when no row matches', async () => {
        stub.ApiKey.findOne.mockResolvedValueOnce(null);
        expect(await auth.getCompanyId('k')).toBe(-1);
    });

    test('returns the akCompanyId when a row is found', async () => {
        stub.ApiKey.findOne.mockResolvedValueOnce({ akCompanyId: 7 });
        expect(await auth.getCompanyId('valid')).toBe(7);
    });

    test('returns -1 for non-positive or non-numeric company id', async () => {
        stub.ApiKey.findOne.mockResolvedValueOnce({ akCompanyId: 0 });
        expect(await auth.getCompanyId('k')).toBe(-1);
        stub.ApiKey.findOne.mockResolvedValueOnce({ akCompanyId: null });
        expect(await auth.getCompanyId('k')).toBe(-1);
        stub.ApiKey.findOne.mockResolvedValueOnce({ akCompanyId: 'wat' });
        expect(await auth.getCompanyId('k')).toBe(-1);
    });

    test('swallows DB errors and returns -1', async () => {
        stub.ApiKey.findOne.mockRejectedValueOnce(new Error('boom'));
        expect(await auth.getCompanyId('k')).toBe(-1);
    });
});

describe('auth.getCompanyIdByCustomerId', () => {
    test('returns -1 for empty / zero / null input', async () => {
        expect(await auth.getCompanyIdByCustomerId(null)).toBe(-1);
        expect(await auth.getCompanyIdByCustomerId(0)).toBe(-1);
        expect(await auth.getCompanyIdByCustomerId('')).toBe(-1);
        expect(stub.Customer.findByPk).not.toHaveBeenCalled();
    });

    test('returns the resolved custCompId on match', async () => {
        stub.Customer.findByPk.mockResolvedValueOnce({ custCompId: 11 });
        expect(await auth.getCompanyIdByCustomerId(5)).toBe(11);
    });

    test('returns -1 when customer not found (e.g. archived under defaultScope)', async () => {
        stub.Customer.findByPk.mockResolvedValueOnce(null);
        expect(await auth.getCompanyIdByCustomerId(99)).toBe(-1);
    });

    test('returns -1 on a non-positive resolved company id', async () => {
        stub.Customer.findByPk.mockResolvedValueOnce({ custCompId: 0 });
        expect(await auth.getCompanyIdByCustomerId(5)).toBe(-1);
    });
});

describe('auth.getCompanyIdByPovId', () => {
    test('returns the resolved povCompId on match', async () => {
        stub.PurchaseOrderVendor.findByPk.mockResolvedValueOnce({ povCompId: 3 });
        expect(await auth.getCompanyIdByPovId(1)).toBe(3);
    });

    test('returns -1 on no-row', async () => {
        stub.PurchaseOrderVendor.findByPk.mockResolvedValueOnce(null);
        expect(await auth.getCompanyIdByPovId(1)).toBe(-1);
    });
});

describe('auth.getCompanyIdByPohId', () => {
    test('resolves through the eager-loaded vendor association (alias: vendor)', async () => {
        // db.config.js registers this association as `as: 'vendor'`
        // so Sequelize attaches the loaded row at `row.vendor`, not
        // `row.PurchaseOrderVendor`. Using the unaliased name was the
        // P5-M latent bug fixed alongside this test.
        stub.PurchaseOrderHeader.findByPk.mockResolvedValueOnce({
            pohId: 1,
            vendor: { povCompId: 9 },
        });
        expect(await auth.getCompanyIdByPohId(1)).toBe(9);
    });

    test('returns -1 if the header is missing', async () => {
        stub.PurchaseOrderHeader.findByPk.mockResolvedValueOnce(null);
        expect(await auth.getCompanyIdByPohId(1)).toBe(-1);
    });

    test('returns -1 if header has no vendor (broken FK)', async () => {
        stub.PurchaseOrderHeader.findByPk.mockResolvedValueOnce({
            pohId: 1,
            vendor: null,
        });
        expect(await auth.getCompanyIdByPohId(1)).toBe(-1);
    });
});

describe('auth.getCompanyIdByJobId', () => {
    test('resolves through the eager-loaded customer association (alias: customer)', async () => {
        // Same alias gotcha as getCompanyIdByPohId above. db.config.js
        // uses `as: 'customer'` for Job → Customer.
        stub.Job.findByPk.mockResolvedValueOnce({
            jobId: 1,
            customer: { custCompId: 12 },
        });
        expect(await auth.getCompanyIdByJobId(1)).toBe(12);
    });

    test('returns -1 if the job is missing', async () => {
        stub.Job.findByPk.mockResolvedValueOnce(null);
        expect(await auth.getCompanyIdByJobId(1)).toBe(-1);
    });

    test('returns -1 if the job has no customer linkage', async () => {
        stub.Job.findByPk.mockResolvedValueOnce({ jobId: 1, customer: null });
        expect(await auth.getCompanyIdByJobId(1)).toBe(-1);
    });
});

describe('auth.getCompanyIdByInvitId', () => {
    test('resolves an inventory item to its owning company', async () => {
        stub.InventoryItem.findByPk.mockResolvedValueOnce({ invitCompId: 7 });
        expect(await auth.getCompanyIdByInvitId(1)).toBe(7);
    });
    test('missing item → -1', async () => {
        stub.InventoryItem.findByPk.mockResolvedValueOnce(null);
        expect(await auth.getCompanyIdByInvitId(1)).toBe(-1);
    });
    test('non-positive / absent id → -1 without a query', async () => {
        expect(await auth.getCompanyIdByInvitId(0)).toBe(-1);
        expect(await auth.getCompanyIdByInvitId(null)).toBe(-1);
        expect(stub.InventoryItem.findByPk).not.toHaveBeenCalled();
    });
});

describe('auth.inventoryFkBelongsTo (secondary-FK tenant guard)', () => {
    test('absent / null FK is allowed with no query (the FK is optional)', async () => {
        expect(await auth.inventoryFkBelongsTo(null, 7)).toBe(true);
        expect(await auth.inventoryFkBelongsTo(undefined, 7)).toBe(true);
        expect(stub.InventoryItem.findByPk).not.toHaveBeenCalled();
    });
    test('same-company item is allowed', async () => {
        stub.InventoryItem.findByPk.mockResolvedValueOnce({ invitCompId: 7 });
        expect(await auth.inventoryFkBelongsTo(5, 7)).toBe(true);
    });
    test('cross-tenant item is rejected', async () => {
        stub.InventoryItem.findByPk.mockResolvedValueOnce({ invitCompId: 8 });
        expect(await auth.inventoryFkBelongsTo(5, 7)).toBe(false);
    });
    test('missing / dangling item id is rejected', async () => {
        stub.InventoryItem.findByPk.mockResolvedValueOnce(null);
        expect(await auth.inventoryFkBelongsTo(999999999, 7)).toBe(false);
    });
});

describe('auth.getCompanyIdByInvId', () => {
    test('resolves an invoice to its company via the customer', async () => {
        stub.Invoice.findByPk.mockResolvedValueOnce({ invId: 1, customer: { custCompId: 8 } });
        expect(await auth.getCompanyIdByInvId(1)).toBe(8);
    });
    test('missing invoice / no customer → -1', async () => {
        stub.Invoice.findByPk.mockResolvedValueOnce(null);
        expect(await auth.getCompanyIdByInvId(1)).toBe(-1);
        stub.Invoice.findByPk.mockResolvedValueOnce({ invId: 1, customer: null });
        expect(await auth.getCompanyIdByInvId(1)).toBe(-1);
    });
    test('non-positive id → -1 without a query', async () => {
        expect(await auth.getCompanyIdByInvId(0)).toBe(-1);
        expect(stub.Invoice.findByPk).not.toHaveBeenCalled();
    });
});

describe('auth.invoiceFkBelongsTo (InvoiceJob injbInvId guard)', () => {
    test('absent FK allowed with no query', async () => {
        expect(await auth.invoiceFkBelongsTo(null, 8)).toBe(true);
        expect(stub.Invoice.findByPk).not.toHaveBeenCalled();
    });
    test('same-company invoice allowed; cross-tenant / missing rejected', async () => {
        stub.Invoice.findByPk.mockResolvedValueOnce({ customer: { custCompId: 8 } });
        expect(await auth.invoiceFkBelongsTo(5, 8)).toBe(true);
        stub.Invoice.findByPk.mockResolvedValueOnce({ customer: { custCompId: 9 } });
        expect(await auth.invoiceFkBelongsTo(5, 8)).toBe(false);
        stub.Invoice.findByPk.mockResolvedValueOnce(null);
        expect(await auth.invoiceFkBelongsTo(999, 8)).toBe(false);
    });
});

describe('auth.requireAuthKey middleware', () => {
    test('403s when no authKey header is present', () => {
        const req = { get: () => undefined };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        const next = vi.fn();
        auth.requireAuthKey(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('calls next() and stashes req.authKey when present', () => {
        const req = { get: (h) => (h === 'authKey' ? 'value' : undefined) };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        const next = vi.fn();
        auth.requireAuthKey(req, res, next);
        expect(req.authKey).toBe('value');
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('auth.requireAuth middleware (post-attachAuth strict gate)', () => {
    test('403 when no authKey on req', () => {
        const req = { authKey: null };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        const next = vi.fn();
        auth.requireAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('403 when present but unknown (companyId = -1, not master)', () => {
        const req = { authKey: 'mystery', isMaster: false, companyId: -1 };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        const next = vi.fn();
        auth.requireAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('passes through when master', () => {
        const req = { authKey: 'k', isMaster: true, companyId: -1 };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        auth.requireAuth(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('passes through when company-scoped', () => {
        const req = { authKey: 'k', isMaster: false, companyId: 5 };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();
        auth.requireAuth(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
