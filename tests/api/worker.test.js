// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for /v1/worker/*. Same approach as customer.test.js:
// asserts only on auth-contract behavior and route mounting; integration
// tests against a live Postgres cover the success paths.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {},
    TimeEntry: {},
    Worker: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAll: vi.fn().mockResolvedValue([]),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ workerId: 1 }),
    },
    ApiKey: {},
    ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('Worker auth contract', () => {
    test('GET /v1/worker/:id returns 403 when authKey missing', async () => {
        const res = await request(app).get('/v1/worker/1');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Authorization key not sent/i);
    });

    test('POST /v1/worker returns 403 when authKey missing', async () => {
        const res = await request(app)
            .post('/v1/worker')
            .send({
                workerFName: 'Ada',
                workerLName: 'Lovelace',
                workerTitle: 'Analyst',
                workerDefaultBillType: 1,
            });
        expect(res.status).toBe(403);
    });

    test('GET /v1/worker/bycompany/:id returns 403 when authKey missing', async () => {
        const res = await request(app).get('/v1/worker/bycompany/1');
        expect(res.status).toBe(403);
    });

    test('PATCH /v1/worker/:id returns 403 when authKey missing', async () => {
        const res = await request(app)
            .patch('/v1/worker/1')
            .send({ workerTitle: 'Senior' });
        expect(res.status).toBe(403);
    });

    test('DELETE /v1/worker/:id returns 403 when authKey missing', async () => {
        const res = await request(app).delete('/v1/worker/1');
        expect(res.status).toBe(403);
    });
});

describe('Worker route mounting (regression)', () => {
    test('GET /v1/worker/:id is mounted (not 404)', async () => {
        const res = await request(app)
            .get('/v1/worker/1')
            .set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    test('POST /v1/worker is mounted', async () => {
        const res = await request(app)
            .post('/v1/worker')
            .set('authKey', 'any')
            .send({
                workerFName: 'Ada',
                workerLName: 'Lovelace',
                workerTitle: 'Analyst',
                workerDefaultBillType: 1,
                workerCompId: 1,
            });
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    test('controller exits with a single well-formed response', async () => {
        const res = await request(app)
            .get('/v1/worker/1')
            .set('authKey', 'whatever-key');
        expect(typeof res.status).toBe('number');
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
});

describe('Worker body validation', () => {
    test('POST /v1/worker rejects unknown body field with 400', async () => {
        const res = await request(app)
            .post('/v1/worker')
            .set('authKey', 'any')
            .send({
                workerFName: 'Ada',
                workerLName: 'Lovelace',
                workerTitle: 'Analyst',
                workerDefaultBillType: 1,
                bogusField: 'reject me',
            });
        expect(res.status).toBe(400);
    });

    test('POST /v1/worker rejects missing required field with 400', async () => {
        const res = await request(app)
            .post('/v1/worker')
            .set('authKey', 'any')
            .send({
                workerFName: 'Ada',
                // missing workerLName, workerTitle, workerDefaultBillType
            });
        expect(res.status).toBe(400);
    });

    test('PATCH /v1/worker/:id rejects unknown body field with 400', async () => {
        const res = await request(app)
            .patch('/v1/worker/1')
            .set('authKey', 'any')
            .send({ bogusField: 'no' });
        expect(res.status).toBe(400);
    });
});

describe('Worker tenant-enumeration defense (secure 404)', () => {
    // Same pattern as the billingtype/company secure-404 tests:
    // drive the controller directly with stubbed Model + spied auth
    // helpers, so we don't have to wire every upstream middleware.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/workercontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.Worker.findByPk = vi.fn().mockResolvedValue({
                workerId: 99, workerCompId: 99, workerArch: false,
            });
            const req = { get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined), params: { id: 99 } };
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
        }
    });

    test('controller update: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/workercontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.Worker.findByPk = vi.fn().mockResolvedValue({
                workerId: 99, workerCompId: 99, workerArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 99 },
                body: { workerFName: 'X' },
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
        }
    });

    test('controller remove: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/workercontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.Worker.findByPk = vi.fn().mockResolvedValue({
                workerId: 99, workerCompId: 99, workerArch: false, update: vi.fn(),
            });
            const req = { get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined), params: { id: 99 } };
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
        }
    });
});
