// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {},
    CustomerPayment: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ cpayId: 1 }),
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

describe('CustomerPayment auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/customerpayment/1')).status).toBe(403); });
    test('POST 403 without authKey', async () => {
        const res = await request(app).post('/v1/customerpayment').send({ cpayCustId: 1, cpayDate: '2026-01-01', cpayAmount: 100 });
        expect(res.status).toBe(403);
    });
    test('GET /bycustomer/:id 403 without authKey', async () => { expect((await request(app).get('/v1/customerpayment/bycustomer/1')).status).toBe(403); });
    test('PATCH 403 without authKey', async () => { expect((await request(app).patch('/v1/customerpayment/1').send({ cpayAmount: 50 })).status).toBe(403); });
    test('DELETE 403 without authKey', async () => { expect((await request(app).delete('/v1/customerpayment/1')).status).toBe(403); });
});

describe('CustomerPayment route mounting', () => {
    test('routes mounted', async () => {
        const _r = await request(app).get('/v1/customerpayment/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('CustomerPayment body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app).post('/v1/customerpayment').set('authKey', 'any').send({ cpayCustId: 1, cpayDate: '2026-01-01', cpayAmount: 100, bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing cpayAmount', async () => {
        const res = await request(app).post('/v1/customerpayment').set('authKey', 'any').send({ cpayCustId: 1, cpayDate: '2026-01-01' });
        expect(res.status).toBe(400);
    });

    test('POST rejects zero cpayAmount', async () => {
        const res = await request(app).post('/v1/customerpayment').set('authKey', 'any')
            .send({ cpayCustId: 1, cpayDate: '2026-01-01', cpayAmount: 0 });
        expect(res.status).toBe(400);
    });

    test('POST accepts a negative cpayAmount (refund model)', async () => {
        // Some operators record refunds as negative payments. The
        // schema only blocks 0 and the infinities, not negatives —
        // pin that so a future tightening surfaces here.
        const res = await request(app).post('/v1/customerpayment').set('authKey', 'any')
            .send({ cpayCustId: 1, cpayDate: '2026-01-01', cpayAmount: -50 });
        expect(res.status).not.toBe(400);
    });

    test('PATCH rejects zero cpayAmount', async () => {
        const res = await request(app).patch('/v1/customerpayment/1').set('authKey', 'any')
            .send({ cpayAmount: 0 });
        expect(res.status).toBe(400);
    });
});
