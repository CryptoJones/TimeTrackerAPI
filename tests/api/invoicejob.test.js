// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {},
    Job: {}, Invoice: {}, CustomerPayment: {},
    InvoiceJob: {
        findByPk: vi.fn().mockResolvedValue(null),
        findOne: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ injbId: 1 }),
    },
    ProductEntry: {},
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

describe('InvoiceJob auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/invoicejob/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/invoicejob').send({ injbInvId: 1, injbJobId: 1, injbAmount: 100 });
        expect(res.status).toBe(403);
    });
    test('GET /byinvoice/:id 403 without authKey', async () => { expect((await request(app).get('/v1/invoicejob/byinvoice/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/invoicejob/1').send({ injbAmount: 50 })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/invoicejob/1')).status).toBe(403); });
});

describe('InvoiceJob route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/invoicejob/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('InvoiceJob body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/invoicejob').set('authKey', 'any').send({ injbInvId: 1, injbJobId: 1, injbAmount: 1, bogus: 'no' });
        expect(res.status).toBe(400);
    });

    test('POST accepts negative injbAmount (credit / discount lines)', async () => {
        const res = await request(app).post('/v1/invoicejob').set('authKey', 'any')
            .send({ injbInvId: 1, injbJobId: 1, injbAmount: -50 });
        expect(res.status).not.toBe(400);
    });

    test('POST accepts zero injbAmount (reference / informational lines)', async () => {
        // Unlike cpayAmount (which rejects 0 because a $0 payment is
        // operator error), invoice lines at $0 are a real accounting
        // case: a courtesy line, a placeholder, or a service-rendered
        // reference. Pin this so a future tightening surfaces here.
        const res = await request(app).post('/v1/invoicejob').set('authKey', 'any')
            .send({ injbInvId: 1, injbJobId: 1, injbAmount: 0 });
        expect(res.status).not.toBe(400);
    });

    test('PATCH rejects non-finite injbAmount (JSON `null` is the only way to send Infinity through JSON, but a string \\"Infinity\\" hits coerce-to-number)', async () => {
        // JSON has no literal for Infinity, but `z.coerce.number()`
        // happily turns the string "Infinity" into the float — and
        // Sequelize's DOUBLE column will store it as `inf`. The
        // .finite() refinement catches it at the schema boundary.
        const res = await request(app).patch('/v1/invoicejob/1').set('authKey', 'any')
            .send({ injbAmount: 'Infinity' });
        expect(res.status).toBe(400);
    });

    test('PATCH rejects -Infinity injbAmount via the same coerce path', async () => {
        const res = await request(app).patch('/v1/invoicejob/1').set('authKey', 'any')
            .send({ injbAmount: '-Infinity' });
        expect(res.status).toBe(400);
    });
});

describe('InvoiceJob tenant-enumeration defense (secure 404)', () => {
    // Job-cascade-scoped: injbJobId → Job.jobCustId → Customer.custCompId.
    // Spy on getCompanyIdByJobId (the helper walks job→customer→company).
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/invoicejobcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByJobIdSpy = vi.spyOn(auth, 'getCompanyIdByJobId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.InvoiceJob.findByPk = vi.fn().mockResolvedValue({
                injbId: 42, injbJobId: 13, injbArch: false,
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
            getCompanyIdByJobIdSpy.mockRestore();
        }
    });

    test('controller update: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/invoicejobcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByJobIdSpy = vi.spyOn(auth, 'getCompanyIdByJobId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.InvoiceJob.findByPk = vi.fn().mockResolvedValue({
                injbId: 42, injbJobId: 13, injbArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 42 },
                body: { injbAmount: 50 },
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
            getCompanyIdByJobIdSpy.mockRestore();
        }
    });

    test('controller remove: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/invoicejobcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByJobIdSpy = vi.spyOn(auth, 'getCompanyIdByJobId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.InvoiceJob.findByPk = vi.fn().mockResolvedValue({
                injbId: 42, injbJobId: 13, injbArch: false, update: vi.fn(),
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
            getCompanyIdByJobIdSpy.mockRestore();
        }
    });
});
