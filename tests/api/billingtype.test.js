// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for /v1/billingtype/*. Same approach as worker.test.js.

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
    Worker: {},
    BillingType: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ btId: 1 }),
    },
    InventoryItem: {},
    Company: {},
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

describe('BillingType auth contract', () => {
    test('GET /v1/billingtype/:id returns 403 when authKey missing', async () => {
        const res = await request(app).get('/v1/billingtype/1');
        expect(res.status).toBe(403);
    });
    test('POST /v1/billingtype returns 403 when authKey missing', async () => {
        const res = await request(app)
            .post('/v1/billingtype')
            .send({ btName: 'Standard', btHourlyRate: 100 });
        expect(res.status).toBe(403);
    });
    test('GET /v1/billingtype/bycompany/:id returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/billingtype/bycompany/1')).status).toBe(403);
    });
    test('PATCH /v1/billingtype/:id returns 403 when authKey missing', async () => {
        expect((await request(app).patch('/v1/billingtype/1').send({ btName: 'New' })).status).toBe(403);
    });
    test('DELETE /v1/billingtype/:id returns 403 when authKey missing', async () => {
        expect((await request(app).delete('/v1/billingtype/1')).status).toBe(403);
    });
});

describe('BillingType route mounting', () => {
    test('routes are mounted (not 404)', async () => {
        const res = await request(app).get('/v1/billingtype/1').set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
});

describe('BillingType tenant-enumeration defense (secure 404)', () => {
    // Same approach as the company secure-404 unit tests: drive the
    // controller directly with stubbed Model + spied auth helpers, so
    // we don't have to wire every upstream middleware. The HTTP-level
    // mock above makes findByPk resolve to null by default, which
    // short-circuits to 404 before the cross-tenant branch is reached.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/billingtypecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.BillingType.findByPk = vi.fn().mockResolvedValue({
                btId: 99, btCompId: 99, btArch: false,
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
        const controller = require('../../app/controllers/billingtypecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.BillingType.findByPk = vi.fn().mockResolvedValue({
                btId: 99, btCompId: 99, btArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 99 },
                body: { btName: 'X' },
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
        const controller = require('../../app/controllers/billingtypecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.BillingType.findByPk = vi.fn().mockResolvedValue({
                btId: 99, btCompId: 99, btArch: false, update: vi.fn(),
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

describe('BillingType body validation', () => {
    test('POST rejects unknown field with 400', async () => {
        const res = await request(app)
            .post('/v1/billingtype')
            .set('authKey', 'any')
            .send({ btName: 'X', btHourlyRate: 1, bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing required btHourlyRate with 400', async () => {
        const res = await request(app)
            .post('/v1/billingtype')
            .set('authKey', 'any')
            .send({ btName: 'Standard' });
        expect(res.status).toBe(400);
    });

    test('POST rejects non-finite btHourlyRate (string "Infinity" coerces past nonnegative())', async () => {
        // .nonnegative() allows Infinity (Infinity >= 0 is true).
        // .finite() in the validator catches it before .nonnegative().
        const res = await request(app)
            .post('/v1/billingtype')
            .set('authKey', 'any')
            .send({ btName: 'Standard', btHourlyRate: 'Infinity' });
        expect(res.status).toBe(400);
    });

    test('POST still rejects negative btHourlyRate', async () => {
        // Pin the existing .nonnegative() guard so .finite() doesn't
        // accidentally relax the negative-block when refactoring.
        const res = await request(app)
            .post('/v1/billingtype')
            .set('authKey', 'any')
            .send({ btName: 'Standard', btHourlyRate: -50 });
        expect(res.status).toBe(400);
    });

    test('POST accepts zero btHourlyRate (pro-bono / internal billing)', async () => {
        // Zero is a legitimate rate (pro-bono engagements, internal-only
        // entries). .finite() + .nonnegative() should let it through.
        const res = await request(app)
            .post('/v1/billingtype')
            .set('authKey', 'any')
            .send({ btName: 'Pro-bono', btHourlyRate: 0 });
        expect(res.status).not.toBe(400);
    });

    test('PATCH rejects non-finite btHourlyRate', async () => {
        const res = await request(app)
            .patch('/v1/billingtype/1')
            .set('authKey', 'any')
            .send({ btHourlyRate: '-Infinity' });
        expect(res.status).toBe(400);
    });
});
