// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {},
    Company: {}, Job: {}, Invoice: {}, CustomerPayment: {},
    InvoiceJob: {}, ProductEntry: {}, VersionInfo: {},
    PurchaseOrderVendor: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ povId: 1 }),
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

describe('PurchaseOrderVendor auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/purchaseordervendor/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/purchaseordervendor').send({
            povName: 'Acme', povMailingAddress1: '1 Main', povMailingCity: 'Lincoln',
        });
        expect(res.status).toBe(403);
    });
    test('GET /bycompany/:id 403 without authKey', async () => { expect((await request(app).get('/v1/purchaseordervendor/bycompany/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/purchaseordervendor/1').send({ povName: 'x' })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/purchaseordervendor/1')).status).toBe(403); });
});

describe('PurchaseOrderVendor route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/purchaseordervendor/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('PurchaseOrderVendor body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/purchaseordervendor').set('authKey', 'any').send({
            povName: 'Acme', povMailingAddress1: '1 Main', povMailingCity: 'Lincoln', bogus: 'no',
        });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing required povName', async () => {
        const res = await request(app).post('/v1/purchaseordervendor').set('authKey', 'any').send({
            povMailingAddress1: '1 Main', povMailingCity: 'Lincoln',
        });
        expect(res.status).toBe(400);
    });
});

describe('PurchaseOrderVendor tenant-enumeration defense (secure 404)', () => {
    // Same pattern as worker/billingtype/inventoryitem/company tests:
    // drive the controller directly with stubbed Model + spied auth
    // helpers so we don't have to wire every upstream middleware.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/purchaseordervendorcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderVendor.findByPk = vi.fn().mockResolvedValue({
                povId: 99, povCompId: 99, povArch: false,
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
        const controller = require('../../app/controllers/purchaseordervendorcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderVendor.findByPk = vi.fn().mockResolvedValue({
                povId: 99, povCompId: 99, povArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 99 },
                body: { povName: 'X' },
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
        const controller = require('../../app/controllers/purchaseordervendorcontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderVendor.findByPk = vi.fn().mockResolvedValue({
                povId: 99, povCompId: 99, povArch: false, update: vi.fn(),
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
