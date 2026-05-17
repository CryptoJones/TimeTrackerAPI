// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {},
    Invoice: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ invId: 1 }),
    },
    CustomerPayment: {},
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

describe('Invoice auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/invoice/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/invoice').send({ invCustId: 1, invDate: '2026-01-01', invDueDate: '2026-02-01' });
        expect(res.status).toBe(403);
    });
    test('GET /bycustomer/:id 403 without authKey', async () => { expect((await request(app).get('/v1/invoice/bycustomer/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/invoice/1').send({ invPaid: true })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/invoice/1')).status).toBe(403); });
});

describe('Invoice route mounting', () => {
    test('routes mounted', async () => {
        expect((await request(app).get('/v1/invoice/1').set('authKey', 'any')).status).not.toBe(404);
    });
});

describe('Invoice body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/invoice').set('authKey', 'any').send({ invCustId: 1, invDate: '2026-01-01', invDueDate: '2026-02-01', bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects bad date format', async () => {
        const res = await request(app).post('/v1/invoice').set('authKey', 'any').send({ invCustId: 1, invDate: 'tomorrow', invDueDate: '2026-02-01' });
        expect(res.status).toBe(400);
    });
});
