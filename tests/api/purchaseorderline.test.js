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
    PurchaseOrderVendor: {}, PurchaseOrderHeader: {},
    PurchaseOrderLine: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ polId: 1 }),
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

describe('PurchaseOrderLine auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/purchaseorderline/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/purchaseorderline').send({
            polpoh: 1, polItemDesc: 'Widget', polQty: 10, polPrice: 5, polInvtId: 1,
        });
        expect(res.status).toBe(403);
    });
    test('GET /byheader/:id 403 without authKey', async () => { expect((await request(app).get('/v1/purchaseorderline/byheader/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/purchaseorderline/1').send({ polQty: 5 })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/purchaseorderline/1')).status).toBe(403); });
});

describe('PurchaseOrderLine route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/purchaseorderline/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('PurchaseOrderLine body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/purchaseorderline').set('authKey', 'any').send({
            polpoh: 1, polItemDesc: 'Widget', polQty: 10, polPrice: 5, polInvtId: 1, bogus: 'no',
        });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing polItemDesc', async () => {
        const res = await request(app).post('/v1/purchaseorderline').set('authKey', 'any').send({
            polpoh: 1, polQty: 10, polPrice: 5, polInvtId: 1,
        });
        expect(res.status).toBe(400);
    });

    test('POST rejects non-finite polQty (string "Infinity" coerces to the float)', async () => {
        const res = await request(app).post('/v1/purchaseorderline').set('authKey', 'any').send({
            polpoh: 1, polItemDesc: 'Widget', polQty: 'Infinity', polPrice: 5, polInvtId: 1,
        });
        expect(res.status).toBe(400);
    });

    test('POST rejects non-finite polPrice', async () => {
        const res = await request(app).post('/v1/purchaseorderline').set('authKey', 'any').send({
            polpoh: 1, polItemDesc: 'Widget', polQty: 10, polPrice: '-Infinity', polInvtId: 1,
        });
        expect(res.status).toBe(400);
    });

    test('POST accepts zero polQty / polPrice (freebie line)', async () => {
        // A $0 PO line is a real "free sample included" case; pin
        // that the .finite() refinement doesn't accidentally block 0.
        const res = await request(app).post('/v1/purchaseorderline').set('authKey', 'any').send({
            polpoh: 1, polItemDesc: 'Freebie', polQty: 0, polPrice: 0, polInvtId: 1,
        });
        expect(res.status).not.toBe(400);
    });

    test('POST accepts negative polQty / polPrice (inline credit / discount)', async () => {
        const res = await request(app).post('/v1/purchaseorderline').set('authKey', 'any').send({
            polpoh: 1, polItemDesc: 'Volume discount', polQty: -1, polPrice: -10, polInvtId: 1,
        });
        expect(res.status).not.toBe(400);
    });

    test('PATCH rejects non-finite polPrice', async () => {
        const res = await request(app).patch('/v1/purchaseorderline/1').set('authKey', 'any').send({
            polPrice: 'Infinity',
        });
        expect(res.status).toBe(400);
    });
});

describe('PurchaseOrderLine tenant-enumeration defense (secure 404)', () => {
    // Two-level cascade: polpoh → header.pohPovId → vendor.povCompId.
    // Spy on getCompanyIdByPohId (which itself walks header→vendor)
    // so the cascade resolves to a different company than the caller.
    test('controller getById: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/purchaseorderlinecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByPohIdSpy = vi.spyOn(auth, 'getCompanyIdByPohId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderLine.findByPk = vi.fn().mockResolvedValue({
                polId: 42, polpoh: 13, polArch: false,
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
            getCompanyIdByPohIdSpy.mockRestore();
        }
    });

    test('controller update: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/purchaseorderlinecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByPohIdSpy = vi.spyOn(auth, 'getCompanyIdByPohId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderLine.findByPk = vi.fn().mockResolvedValue({
                polId: 42, polpoh: 13, polArch: false, update: vi.fn(),
            });
            const req = {
                get: (h) => (h === 'authKey' ? 'scoped-to-7' : undefined),
                params: { id: 42 },
                body: { polItemDesc: 'X' },
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
            getCompanyIdByPohIdSpy.mockRestore();
        }
    });

    test('controller remove: existing-but-not-yours returns 404 to non-master', async () => {
        const auth = require('../../app/middleware/auth.js');
        const controller = require('../../app/controllers/purchaseorderlinecontroller.js');
        const isMasterSpy = vi.spyOn(auth, 'isMaster').mockResolvedValue(false);
        const getCompanyIdSpy = vi.spyOn(auth, 'getCompanyId').mockResolvedValue(7);
        const getCompanyIdByPohIdSpy = vi.spyOn(auth, 'getCompanyIdByPohId').mockResolvedValue(99);
        try {
            const db = require('../../app/config/db.config.js');
            db.PurchaseOrderLine.findByPk = vi.fn().mockResolvedValue({
                polId: 42, polpoh: 13, polArch: false, update: vi.fn(),
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
            getCompanyIdByPohIdSpy.mockRestore();
        }
    });
});
