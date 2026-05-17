// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {},
    Job: {}, Invoice: {}, CustomerPayment: {}, InvoiceJob: {},
    ProductEntry: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ pentId: 1 }),
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

describe('ProductEntry auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/productentry/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/productentry').send({ pentQty: 1, pentJobId: 1, pentInvtId: 1 });
        expect(res.status).toBe(403);
    });
    test('GET /byjob/:id 403 without authKey', async () => { expect((await request(app).get('/v1/productentry/byjob/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/productentry/1').send({ pentQty: 2 })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/productentry/1')).status).toBe(403); });
});

describe('ProductEntry route mounting', () => {
    test('routes mounted', async () => {
        expect((await request(app).get('/v1/productentry/1').set('authKey', 'any')).status).not.toBe(404);
    });
});

describe('ProductEntry body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/productentry').set('authKey', 'any').send({ pentQty: 1, pentJobId: 1, pentInvtId: 1, bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing pentJobId', async () => {
        const res = await request(app).post('/v1/productentry').set('authKey', 'any').send({ pentQty: 1, pentInvtId: 1 });
        expect(res.status).toBe(400);
    });
});
