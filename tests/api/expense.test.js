// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/expense — auth + schema (no DB).

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: { gte: Symbol('gte'), lte: Symbol('lte') } },
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {},
    Expense: {
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        findByPk: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
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

describe('Expense auth + schema contract', () => {
    test('POST /v1/expense 403 without authKey (valid body reaches controller)', async () => {
        const res = await request(app).post('/v1/expense').send({ expDate: '2026-07-01', expAmount: 10 });
        expect(res.status).toBe(403);
    });
    test('POST /v1/expense 400 on missing required fields (schema)', async () => {
        expect((await request(app).post('/v1/expense').set('authKey', 'k').send({})).status).toBe(400);
    });
    test('POST /v1/expense 400 on a negative amount (schema)', async () => {
        const res = await request(app).post('/v1/expense').set('authKey', 'k')
            .send({ expDate: '2026-07-01', expAmount: -5 });
        expect(res.status).toBe(400);
    });
    test('POST /v1/expense 400 on an unknown field (strict schema)', async () => {
        const res = await request(app).post('/v1/expense').set('authKey', 'k')
            .send({ expDate: '2026-07-01', expAmount: 10, bogus: 1 });
        expect(res.status).toBe(400);
    });
    test('GET /v1/expense/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/expense/1')).status).toBe(403);
    });
    test('GET /v1/expense/bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/expense/bycompany/1')).status).toBe(403);
    });
    test('PATCH /v1/expense/:id 403 without authKey', async () => {
        expect((await request(app).patch('/v1/expense/1').send({ expAmount: 5 })).status).toBe(403);
    });
    test('DELETE /v1/expense/:id 403 without authKey', async () => {
        expect((await request(app).delete('/v1/expense/1')).status).toBe(403);
    });
});
