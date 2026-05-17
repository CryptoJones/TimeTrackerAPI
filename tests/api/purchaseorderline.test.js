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
        expect((await request(app).get('/v1/purchaseorderline/1').set('authKey', 'any')).status).not.toBe(404);
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
});
