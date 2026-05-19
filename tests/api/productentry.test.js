// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {},
    Job: {}, Invoice: {}, CustomerPayment: {}, InvoiceJob: {},
    ProductEntry: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ pentId: 1 }),
    },
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

describe('ProductEntry auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/productentry/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/productentry').send({ pentQty: 1, pentJobId: 1, pentInvtId: 1 });
        expect(res.status).toBe(403);
    });
    test('GET /byjob/:id 403 without authKey', async () => { expect((await request(app).get('/v1/productentry/byjob/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/productentry/1').send({ pentQty: 2 })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/productentry/1')).status).toBe(403); });
});

describe('ProductEntry route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/productentry/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('ProductEntry body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/productentry').set('authKey', 'any').send({ pentQty: 1, pentJobId: 1, pentInvtId: 1, bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing pentJobId', async () => {
        const res = await request(app).post('/v1/productentry').set('authKey', 'any').send({ pentQty: 1, pentInvtId: 1 });
        expect(res.status).toBe(400);
    });
});

describe('ProductEntry tenant-enumeration defense (secure 404)', () => {
    // Job-cascade-scoped: pentJobId → job.jobCustId → customer.custCompId.
    // Spy on getCompanyIdByJobId so the cascade resolves to a different
    // company than the caller's (the helper itself walks job→customer).
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/productentrycontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByJobIdSpy = vi.spyOn(auth, 'getCompanyIdByJobId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.ProductEntry.findByPk = vi.fn().mockResolvedValue({
                pentId: 42, pentJobId: 13, penArch: false,
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
        const controller = require('../../app/controllers/productentrycontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByJobIdSpy = vi.spyOn(auth, 'getCompanyIdByJobId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.ProductEntry.findByPk = vi.fn().mockResolvedValue({
                pentId: 42, pentJobId: 13, penArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 42 },
                body: { pentQty: 5 },
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
        const controller = require('../../app/controllers/productentrycontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByJobIdSpy = vi.spyOn(auth, 'getCompanyIdByJobId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.ProductEntry.findByPk = vi.fn().mockResolvedValue({
                pentId: 42, pentJobId: 13, penArch: false, update: vi.fn(),
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
