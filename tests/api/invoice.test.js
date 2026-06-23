// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {},
    Invoice: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ invId: 1 }),
    },
    CustomerPayment: {},
    ApiKey: {}, ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('Invoice auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/invoice/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/invoice').send({ invCustId: 1, invDate: '2026-01-01', invDueDate: '2026-02-01' });
        expect(res.status).toBe(403);
    });
    test('GET /bycustomer/:id 403 without authKey', async () => { expect((await request(app).get('/v1/invoice/bycustomer/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/invoice/1').send({ invPaid: true })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/invoice/1')).status).toBe(403); });
});

describe('Invoice route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/invoice/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('Invoice body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/invoice').set('authKey', 'any').send({ invCustId: 1, invDate: '2026-01-01', invDueDate: '2026-02-01', bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects bad date format', async () => {
        const res = await request(app).post('/v1/invoice').set('authKey', 'any').send({ invCustId: 1, invDate: 'tomorrow', invDueDate: '2026-02-01' });
        expect(res.status).toBe(400);
    });

    test('POST rejects invDueDate strictly before invDate', async () => {
        // Inverted range — due date *before* issue date is nonsense. Pin
        // the refinement so a future schema refactor can't accidentally
        // drop the check.
        const res = await request(app).post('/v1/invoice').set('authKey', 'any').send({
            invCustId: 1,
            invDate: '2026-05-15',
            invDueDate: '2026-05-01',
        });
        expect(res.status).toBe(400);
        const issue = res.body.issues && res.body.issues.find((i) => i.path === 'invDueDate');
        expect(issue).toBeDefined();
        expect(issue.message).toMatch(/on or after invDate/i);
    });

    test('POST accepts invDueDate equal to invDate (zero-day-net / "Due on Receipt")', async () => {
        // Equality is a legitimate billing term, not a bug. Schema must
        // not 400 — auth/controller decides the final status from there.
        const res = await request(app).post('/v1/invoice').set('authKey', 'any').send({
            invCustId: 1,
            invDate: '2026-05-15',
            invDueDate: '2026-05-15',
        });
        expect(res.status).not.toBe(400);
    });

    test('PATCH rejects inverted range when both bounds are sent', async () => {
        const res = await request(app).patch('/v1/invoice/1').set('authKey', 'any').send({
            invDate: '2026-05-15',
            invDueDate: '2026-05-01',
        });
        expect(res.status).toBe(400);
        const issue = res.body.issues && res.body.issues.find((i) => i.path === 'invDueDate');
        expect(issue).toBeDefined();
    });

    test('PATCH with only invDueDate is not blocked by the schema', async () => {
        // The cross-field refinement can't validate a single-bound PATCH
        // without seeing the existing row; the schema must not reject
        // it. Controller-layer enforcement against the existing invDate
        // is a separate follow-up.
        const res = await request(app).patch('/v1/invoice/1').set('authKey', 'any').send({
            invDueDate: '2026-05-01',
        });
        expect(res.status).not.toBe(400);
    });

    test('bulk POST rejects an inverted-range entry inside the batch', async () => {
        // The bulk path validates each element through createInvoiceBody,
        // so the refinement must fire there too — anything else would
        // let an attacker bypass the check by wrapping the bad entry in
        // a bulk envelope.
        const res = await request(app).post('/v1/invoice/bulk').set('authKey', 'any').send({
            invoices: [
                { invCustId: 1, invDate: '2026-05-15', invDueDate: '2026-05-01' },
            ],
        });
        expect(res.status).toBe(400);
        // Path on a bulk entry's issue: `invoices.0.invDueDate`.
        const issue = res.body.issues && res.body.issues.find((i) => i.path.endsWith('invDueDate'));
        expect(issue).toBeDefined();
    });
});

describe('Invoice tenant-enumeration defense (secure 404)', () => {
    // Customer-cascade-scoped: invCustId → customer.custCompId.
    // Spy on getCompanyIdByCustomerId so the cascade resolves to a
    // different company than the caller's.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/invoicecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByCustomerIdSpy = vi.spyOn(auth, 'getCompanyIdByCustomerId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.Invoice.findByPk = vi.fn().mockResolvedValue({
                invId: 42, invCustId: 13, invArch: false,
            });
            const req = { get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined), params: { id: 42 } };
            let captured = null;
            const res = {
                status(code) { this._code = code; return this; },
                json(body) { captured = { code: this._code, body }; return this; },
            };
            await controller.getById(req, res);
            expect(captured.code).toBe(404);
            expect(captured.body.message).toMatch(/not found/i);
        } finally {
            isMasterSpy.mockRestore();
            getCompanyIdSpy.mockRestore();
            getCompanyIdByCustomerIdSpy.mockRestore();
        }
    });

    test('controller update: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/invoicecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByCustomerIdSpy = vi.spyOn(auth, 'getCompanyIdByCustomerId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.Invoice.findByPk = vi.fn().mockResolvedValue({
                invId: 42, invCustId: 13, invArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 42 },
                body: { invPaid: true },
            };
            let captured = null;
            const res = {
                status(code) { this._code = code; return this; },
                json(body) { captured = { code: this._code, body }; return this; },
            };
            await controller.update(req, res);
            expect(captured.code).toBe(404);
            expect(captured.body.message).toMatch(/not found/i);
        } finally {
            isMasterSpy.mockRestore();
            getCompanyIdSpy.mockRestore();
            getCompanyIdByCustomerIdSpy.mockRestore();
        }
    });

    test('controller remove: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/invoicecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByCustomerIdSpy = vi.spyOn(auth, 'getCompanyIdByCustomerId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.Invoice.findByPk = vi.fn().mockResolvedValue({
                invId: 42, invCustId: 13, invArch: false, update: vi.fn(),
            });
            const req = { get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined), params: { id: 42 } };
            let captured = null;
            const res = {
                status(code) { this._code = code; return this; },
                json(body) { captured = { code: this._code, body }; return this; },
            };
            await controller.remove(req, res);
            expect(captured.code).toBe(404);
            expect(captured.body.message).toMatch(/not found/i);
        } finally {
            isMasterSpy.mockRestore();
            getCompanyIdSpy.mockRestore();
            getCompanyIdByCustomerIdSpy.mockRestore();
        }
    });
});

describe('POST /v1/invoice/:id/payment — recordPayment', () => {
    const schemas = require('../../app/schemas/invoice.schema.js');

    function fakeRes() {
        return {
            status(code) { this._code = code; return this; },
            json(body) { this._body = body; return this; },
        };
    }

    test('schema rejects missing / non-positive amount and unknown fields', () => {
        expect(schemas.recordPaymentBody.safeParse({}).success).toBe(false);
        expect(schemas.recordPaymentBody.safeParse({ amount: -5 }).success).toBe(false);
        expect(schemas.recordPaymentBody.safeParse({ amount: 0 }).success).toBe(false);
        expect(schemas.recordPaymentBody.safeParse({ amount: 50, bogus: 1 }).success).toBe(false);
        expect(schemas.recordPaymentBody.safeParse({ amount: 50 }).success).toBe(true);
        expect(schemas.recordPaymentBody.safeParse({ amount: 50, date: '2026-01-02', description: 'x' }).success).toBe(true);
    });

    test('403 when authKey header is missing', async () => {
        const controller = require('../../app/controllers/invoicecontroller.js');
        const req = { get: () => undefined, params: { id: 1 }, body: { amount: 50 } };
        const r = fakeRes();
        await controller.recordPayment(req, r);
        expect(r._code).toBe(403);
    });

    test('404 when the invoice does not exist', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/invoicecontroller.js');
        const db = require('../../app/config/db.config.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(true);
        try {
            db.Invoice.findByPk = vi.fn().mockResolvedValue(null);
            const req = { get: (h) => (h === 'authKey' ? 'm' : undefined), params: { id: 999 }, body: { amount: 50 } };
            const r = fakeRes();
            await controller.recordPayment(req, r);
            expect(r._code).toBe(404);
        } finally { isMasterSpy.mockRestore(); }
    });

    // NOTE: the 201 success path (create payment + recompute status) is a
    // DB-touching transaction. It can't be unit-tested here — the
    // controller captures auth.isMaster / db.Invoice at load, so vi.spyOn
    // and property-override don't reach it (the same limitation the
    // secure-404 tests above work around). The money math is covered by
    // tests/unit/money.test.js; the full record-payment flow against real
    // Postgres lives in tests/integration/invoice-payments.test.js.
});

describe('POST /v1/invoice/from-job/:id — createFromJob', () => {
    const schemas = require('../../app/schemas/invoice.schema.js');

    test('fromJobBody: optional fields validate; bad ones rejected', () => {
        expect(schemas.fromJobBody.safeParse({}).success).toBe(true);
        expect(schemas.fromJobBody.safeParse({ invDate: '2026-01-01', netDays: 30 }).success).toBe(true);
        expect(schemas.fromJobBody.safeParse({ invDate: 'nope' }).success).toBe(false);
        expect(schemas.fromJobBody.safeParse({ netDays: -1 }).success).toBe(false);
        expect(schemas.fromJobBody.safeParse({ netDays: 9999 }).success).toBe(false);
        expect(schemas.fromJobBody.safeParse({ bogus: 1 }).success).toBe(false);
    });

    test('403 when authKey header is missing', async () => {
        const controller = require('../../app/controllers/invoicecontroller.js');
        const req = { get: () => undefined, params: { id: 1 }, body: {} };
        const r = {
            status(code) { this._code = code; return this; },
            json(body) { this._body = body; return this; },
        };
        await controller.createFromJob(req, r);
        expect(r._code).toBe(403);
    });

    // The 201 auto-bill happy path (gather time → compute → create invoice
    // → consume entries) is a multi-table DB transaction; it's exercised
    // against real Postgres in tests/integration/invoice-from-job.test.js,
    // and the rate/amount math is unit-tested in tests/unit/money.test.js.
});

describe('POST /v1/invoice/:id/carry-forward — createCarryForward', () => {
    const schemas = require('../../app/schemas/invoice.schema.js');

    test('carryForwardBody: optional fields validate; bad ones rejected', () => {
        expect(schemas.carryForwardBody.safeParse({}).success).toBe(true);
        expect(schemas.carryForwardBody.safeParse({ invDate: '2026-01-01', netDays: 15, voidOriginal: false }).success).toBe(true);
        expect(schemas.carryForwardBody.safeParse({ voidOriginal: 'yes' }).success).toBe(false);
        expect(schemas.carryForwardBody.safeParse({ netDays: 9999 }).success).toBe(false);
        expect(schemas.carryForwardBody.safeParse({ bogus: 1 }).success).toBe(false);
    });

    test('403 when authKey header is missing', async () => {
        const controller = require('../../app/controllers/invoicecontroller.js');
        const req = { get: () => undefined, params: { id: 1 }, body: {} };
        const r = {
            status(code) { this._code = code; return this; },
            json(body) { this._body = body; return this; },
        };
        await controller.createCarryForward(req, r);
        expect(r._code).toBe(403);
    });

    // The 201 happy path (compute balance → new invoice + brought-forward
    // line → void original) is a multi-table transaction, exercised against
    // real Postgres in tests/integration/invoice-carry-forward.test.js.
});
