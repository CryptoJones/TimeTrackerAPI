// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {},
    Job: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ jobId: 1 }),
    },
    Invoice: {}, CustomerPayment: {},
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

describe('Job auth contract', () => {
    test('GET /v1/job/:id 403 without authKey', async () => { expect((await request(app).get('/v1/job/1')).status).toBe(403); });
    test('POST /v1/job 403 without authKey', async () => {
        const res = await request(app).post('/v1/job').send({ jobCustId: 1, jobDesc: 'work' });
        expect(res.status).toBe(403);
    });
    test('GET /v1/job/bycustomer/:id 403 without authKey', async () => { expect((await request(app).get('/v1/job/bycustomer/1')).status).toBe(403); });
    test('PATCH /v1/job/:id 403 without authKey', async () => { expect((await request(app).patch('/v1/job/1').send({ jobDesc: 'x' })).status).toBe(403); });
    test('DELETE /v1/job/:id 403 without authKey', async () => { expect((await request(app).delete('/v1/job/1')).status).toBe(403); });
});

describe('Job route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/job/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('Job body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/job').set('authKey', 'any').send({ jobCustId: 1, jobDesc: 'x', bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing jobDesc', async () => {
        const res = await request(app).post('/v1/job').set('authKey', 'any').send({ jobCustId: 1 });
        expect(res.status).toBe(400);
    });
});

describe('Job tenant-enumeration defense (secure 404)', () => {
    // Customer-cascade-scoped: jobCustId → customer.custCompId.
    // Spy on getCompanyIdByCustomerId so the cascade resolves to a
    // different company than the caller's.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/jobcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByCustomerIdSpy = vi.spyOn(auth, 'getCompanyIdByCustomerId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.Job.findByPk = vi.fn().mockResolvedValue({
                jobId: 42, jobCustId: 13, jobArch: false,
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
        const controller = require('../../app/controllers/jobcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByCustomerIdSpy = vi.spyOn(auth, 'getCompanyIdByCustomerId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.Job.findByPk = vi.fn().mockResolvedValue({
                jobId: 42, jobCustId: 13, jobArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 42 },
                body: { jobDesc: 'X' },
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
        const controller = require('../../app/controllers/jobcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByCustomerIdSpy = vi.spyOn(auth, 'getCompanyIdByCustomerId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.Job.findByPk = vi.fn().mockResolvedValue({
                jobId: 42, jobCustId: 13, jobArch: false, update: vi.fn(),
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
