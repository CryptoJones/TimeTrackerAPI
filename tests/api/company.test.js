// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for /v1/company/*. Company is special: master-only
// for POST/DELETE/list, scoped for GET/PATCH.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {},
    Company: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ compId: 1 }),
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

describe('Company auth contract', () => {
    test('GET /v1/company/:id returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/company/1')).status).toBe(403);
    });
    test('GET /v1/company returns 403 when authKey missing', async () => {
        expect((await request(app).get('/v1/company')).status).toBe(403);
    });
    test('POST /v1/company returns 403 when authKey missing', async () => {
        const res = await request(app).post('/v1/company').send({ compName: 'X' });
        expect(res.status).toBe(403);
    });
    test('PATCH /v1/company/:id returns 403 when authKey missing', async () => {
        expect((await request(app).patch('/v1/company/1').send({ compName: 'X' })).status).toBe(403);
    });
    test('DELETE /v1/company/:id returns 403 when authKey missing', async () => {
        expect((await request(app).delete('/v1/company/1')).status).toBe(403);
    });

    // Non-master keys hit "Only master keys may create companies" path
    // (mock returns empty so IsMaster -> false).
    test('POST /v1/company returns 403 for non-master keys', async () => {
        const res = await request(app)
            .post('/v1/company')
            .set('authKey', 'not-a-master')
            .send({ compName: 'X' });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/master/i);
    });
});

describe('Company route mounting', () => {
    test('GET /v1/company/:id mounted (not 404)', async () => {
        const res = await request(app).get('/v1/company/1').set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
    test('GET /v1/company mounted', async () => {
        const res = await request(app).get('/v1/company').set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
});

describe('Company body validation', () => {
    test('POST rejects unknown field with 400', async () => {
        const res = await request(app)
            .post('/v1/company')
            .set('authKey', 'any')
            .send({ compName: 'X', bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects missing compName with 400', async () => {
        const res = await request(app)
            .post('/v1/company')
            .set('authKey', 'any')
            .send({ compCity: 'Lincoln' });
        expect(res.status).toBe(400);
    });
});
