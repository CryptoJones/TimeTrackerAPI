// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for /v1/billingtype/*. Same approach as worker.test.js.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {},
    TimeEntry: {},
    Worker: {},
    BillingType: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ btId: 1 }),
    },
    InventoryItem: {},
    Company: {},
    ApiKey: {},
    ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('BillingType auth contract', () => {
    test('GET /v1/billingtype/:id returns 403 when authKey missing', async () => {
        const res = await request(app).get('/v1/billingtype/1');
        expect(res.status).toBe(403);
    });
    test('POST /v1/billingtype returns 403 when authKey missing', async () => {
        const res = await request(app)
            .post('/v1/billingtype')
            .send({ btName: 'Standard', btHourlyRate: 100 });
        expect(res.status).toBe(403);
    });
    test('GET /v1/billingtype/bycompany/:id returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/billingtype/bycompany/1')).status).toBe(403);
    });
    test('PATCH /v1/billingtype/:id returns 403 when authKey missing', async () => {
        expect((await request(app).patch('/v1/billingtype/1').send({ btName: 'New' })).status).toBe(403);
    });
    test('DELETE /v1/billingtype/:id returns 403 when authKey missing', async () => {
        expect((await request(app).delete('/v1/billingtype/1')).status).toBe(403);
    });
});

describe('BillingType route mounting', () => {
    test('routes are mounted (not 404)', async () => {
        const res = await request(app).get('/v1/billingtype/1').set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
});

describe('BillingType body validation', () => {
    test('POST rejects unknown field with 400', async () => {
        const res = await request(app)
            .post('/v1/billingtype')
            .set('authKey', 'any')
            .send({ btName: 'X', btHourlyRate: 1, bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing required btHourlyRate with 400', async () => {
        const res = await request(app)
            .post('/v1/billingtype')
            .set('authKey', 'any')
            .send({ btName: 'Standard' });
        expect(res.status).toBe(400);
    });
});
