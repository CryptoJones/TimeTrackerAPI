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
    PurchaseOrderVendor: {}, PurchaseOrderHeader: {}, PurchaseOrderLine: {},
    InventoryTransaction: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ invtId: 1 }),
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

describe('InventoryTransaction auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/inventorytransaction/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/inventorytransaction').send({ invtDirection: 0, invtInitId: 1 });
        expect(res.status).toBe(403);
    });
    test('GET /bycompany/:id 403 without authKey', async () => { expect((await request(app).get('/v1/inventorytransaction/bycompany/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/inventorytransaction/1').send({ invtDirection: 1 })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/inventorytransaction/1')).status).toBe(403); });
});

describe('InventoryTransaction route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/inventorytransaction/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('InventoryTransaction body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/inventorytransaction').set('authKey', 'any').send({
            invtDirection: 0, invtInitId: 1, bogus: 'no',
        });
        expect(res.status).toBe(400);
    });
    test('POST rejects invalid invtDirection (must be 0 or 1)', async () => {
        const res = await request(app).post('/v1/inventorytransaction').set('authKey', 'any').send({
            invtDirection: 7, invtInitId: 1,
        });
        expect(res.status).toBe(400);
    });
});
