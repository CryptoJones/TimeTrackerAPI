// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {},
    InventoryItem: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ invitId: 1 }),
    },
    Company: {},
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

describe('InventoryItem auth contract', () => {
    test('GET /v1/inventoryitem/:id returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/inventoryitem/1')).status).toBe(403);
    });
    test('POST /v1/inventoryitem returns 403 when authKey missing', async () => {
        const res = await request(app)
            .post('/v1/inventoryitem')
            .send({ invitDescription: 'Widget', invitQty: 10 });
        expect(res.status).toBe(403);
    });
    test('GET /v1/inventoryitem/bycompany/:id returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/inventoryitem/bycompany/1')).status).toBe(403);
    });
    test('PATCH /v1/inventoryitem/:id returns 403 when authKey missing', async () => {
        expect((await request(app).patch('/v1/inventoryitem/1').send({ invitQty: 5 })).status).toBe(403);
    });
    test('DELETE /v1/inventoryitem/:id returns 403 when authKey missing', async () => {
        expect((await request(app).delete('/v1/inventoryitem/1')).status).toBe(403);
    });
});

describe('InventoryItem route mounting', () => {
    test('routes mounted (not 404)', async () => {
        const res = await request(app).get('/v1/inventoryitem/1').set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
});

describe('InventoryItem body validation', () => {
    test('POST rejects unknown field with 400', async () => {
        const res = await request(app)
            .post('/v1/inventoryitem')
            .set('authKey', 'any')
            .send({ invitDescription: 'X', invitQty: 1, bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing required invitQty with 400', async () => {
        const res = await request(app)
            .post('/v1/inventoryitem')
            .set('authKey', 'any')
            .send({ invitDescription: 'X' });
        expect(res.status).toBe(400);
    });
});

describe('InventoryItem tenant-enumeration defense (secure 404)', () => {
    // Same pattern as worker/billingtype/company secure-404 tests:
    // drive the controller directly with stubbed Model + spied auth
    // helpers so we don't have to wire every upstream middleware.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/inventoryitemcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.InventoryItem.findByPk = vi.fn().mockResolvedValue({
                invitId: 99, invitCompId: 99, invitArch: false,
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
        const controller = require('../../app/controllers/inventoryitemcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.InventoryItem.findByPk = vi.fn().mockResolvedValue({
                invitId: 99, invitCompId: 99, invitArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 99 },
                body: { invitDescription: 'X' },
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
        const controller = require('../../app/controllers/inventoryitemcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.InventoryItem.findByPk = vi.fn().mockResolvedValue({
                invitId: 99, invitCompId: 99, invitArch: false, update: vi.fn(),
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
