// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for /v1/company/*. Company is special: master-only
// for POST/DELETE/list, scoped for GET/PATCH.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {},
    Company: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ compId: 1 }),
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

describe('Company auth contract', () => {
    test('GET /v1/company/:id returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/company/1')).status).toBe(403);
    });
    test('GET /v1/company returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/company')).status).toBe(403);
    });
    test('POST /v1/company returns 403 when authKey missing', async () => {
        const res = await request(app).post('/v1/company').send({ compName: 'X' });
        expect(res.status).toBe(403);
    });
    test('PATCH /v1/company/:id returns 403 when authKey missing', async () => {
        expect((await request(app).patch('/v1/company/1').send({ compName: 'X' })).status).toBe(403);
    });
    test('DELETE /v1/company/:id returns 403 when authKey missing', async () => {
        expect((await request(app).delete('/v1/company/1')).status).toBe(403);
    });

    // Non-master keys hit "Only master keys may create companies" path
    // (mock returns empty so IsMaster -> false).
    test('POST /v1/company returns 403 for non-master keys', async () => {
        const res = await request(app)
            .post('/v1/company')
            .set('authKey', 'not-a-master')
            .send({ compName: 'X' });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/master/i);
    });
});

describe('Company route mounting', () => {
    test('GET /v1/company/:id mounted (not 404)', async () => {
        const res = await request(app).get('/v1/company/1').set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
    test('GET /v1/company mounted', async () => {
        const res = await request(app).get('/v1/company').set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
});

describe('Company tenant-enumeration defense (secure 404)', () => {
    // Unit-level: exercise the controller's getById/update directly with
    // a stub `res` and an explicit `Company` model whose findByPk
    // returns the "exists but not yours" shape. Sidesteps the HTTP
    // pipeline so we don't have to wire every upstream middleware
    // through testing seams — the assertion is just about the response
    // code the controller chose for the cross-tenant branch.
    //
    // Why test at this level
    //   The HTTP-level mock used by the other tests in this file makes
    //   `Company.findByPk` resolve to `null` by default, which the
    //   controller short-circuits to a 404 BEFORE the cross-tenant
    //   branch is reached. Driving findByPk to return a populated row
    //   from the HTTP layer requires reaching deep into vitest module
    //   state in a way that fights vi.mock's hoisting; the controller-
    //   level test below pins the same behavioral guarantee much more
    //   cleanly.

    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        // Use the exposed _internals seam (companycontroller.js:198).
        // The controller's getById path uses IsMaster + GetCompanyId
        // captured as module-locals; we can't rebind those across the
        // ESM boundary, so we drive them indirectly by spying on
        // auth.js's own exports — the helpers the captured locals point
        // to.
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/companycontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.Company.findByPk = vi.fn().mockResolvedValue({ compId: 99, compArch: false });

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
        const controller = require('../../app/controllers/companycontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = await import('../../app/config/db.config.js');
            db.Company.findByPk = vi.fn().mockResolvedValue({
                compId: 99, compArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 99 },
                body: { compName: 'X' },
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
});

describe('Company body validation', () => {
    test('POST rejects unknown field with 400', async () => {
        const res = await request(app)
            .post('/v1/company')
            .set('authKey', 'any')
            .send({ compName: 'X', bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing compName with 400', async () => {
        const res = await request(app)
            .post('/v1/company')
            .set('authKey', 'any')
            .send({ compCity: 'Lincoln' });
        expect(res.status).toBe(400);
    });
});
