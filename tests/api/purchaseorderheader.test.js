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
    PurchaseOrderVendor: {},
    PurchaseOrderHeader: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ pohId: 1 }),
    },
    PurchaseOrderLine: {},
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

describe('PurchaseOrderHeader auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/purchaseorderheader/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/purchaseorderheader').send({
            pohDate: '2026-05-17T00:00:00Z', pohReference: 'PO-1', pohTerms: 'NET30', pohPovId: 1,
        });
        expect(res.status).toBe(403);
    });
    test('GET /byvendor/:id 403 without authKey', async () => { expect((await request(app).get('/v1/purchaseorderheader/byvendor/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/purchaseorderheader/1').send({ pohReference: 'x' })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/purchaseorderheader/1')).status).toBe(403); });
});

describe('PurchaseOrderHeader route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/purchaseorderheader/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('PurchaseOrderHeader body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/purchaseorderheader').set('authKey', 'any').send({
            pohDate: '2026-05-17T00:00:00Z', pohReference: 'PO-1', pohTerms: 'NET30', pohPovId: 1, bogus: 'no',
        });
        expect(res.status).toBe(400);
    });
    test('POST rejects bad datetime', async () => {
        const res = await request(app).post('/v1/purchaseorderheader').set('authKey', 'any').send({
            pohDate: 'tomorrow', pohReference: 'PO-1', pohTerms: 'NET30', pohPovId: 1,
        });
        expect(res.status).toBe(400);
    });
});

describe('PurchaseOrderHeader tenant-enumeration defense (secure 404)', () => {
    // Vendor-cascade-scoped: pohPovId → vendor.povCompId. Spy on
    // getCompanyIdByPovId so the cascade resolves to a different
    // company than the caller's, and verify the 404 fallback.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/purchaseorderheadercontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByPovIdSpy = vi.spyOn(auth, 'getCompanyIdByPovId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderHeader.findByPk = vi.fn().mockResolvedValue({
                pohId: 42, pohPovId: 99, pohArch: false,
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
            getCompanyIdByPovIdSpy.mockRestore();
        }
    });

    test('controller update: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/purchaseorderheadercontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByPovIdSpy = vi.spyOn(auth, 'getCompanyIdByPovId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderHeader.findByPk = vi.fn().mockResolvedValue({
                pohId: 42, pohPovId: 99, pohArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 42 },
                body: { pohReference: 'X' },
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
            getCompanyIdByPovIdSpy.mockRestore();
        }
    });

    test('controller remove: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/purchaseorderheadercontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByPovIdSpy = vi.spyOn(auth, 'getCompanyIdByPovId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderHeader.findByPk = vi.fn().mockResolvedValue({
                pohId: 42, pohPovId: 99, pohArch: false, update: vi.fn(),
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
            getCompanyIdByPovIdSpy.mockRestore();
        }
    });
});
