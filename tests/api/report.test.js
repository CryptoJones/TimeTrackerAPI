// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/report/*.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: { ne: Symbol('ne'), gte: Symbol('gte'), lte: Symbol('lte') } },
    Customer: {}, TimeEntry: { findAll: vi.fn().mockResolvedValue([]) },
    Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {},
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

describe('Report auth + schema contract', () => {
    test('GET /v1/report/unbilled 403 without authKey', async () => {
        expect((await request(app).get('/v1/report/unbilled')).status).toBe(403);
    });
    test('GET /v1/report/unbilled rejects an unknown query param (schema)', async () => {
        const res = await request(app).get('/v1/report/unbilled?bogus=1').set('authKey', 'k');
        expect(res.status).toBe(400);
    });
    test('GET /v1/report/unbilled rejects a non-integer companyId (schema)', async () => {
        const res = await request(app).get('/v1/report/unbilled?companyId=abc').set('authKey', 'k');
        expect(res.status).toBe(400);
    });
    test('GET /v1/report/hours 403 without authKey', async () => {
        expect((await request(app).get('/v1/report/hours')).status).toBe(403);
    });
    test('GET /v1/report/hours rejects an unknown query param (schema)', async () => {
        expect((await request(app).get('/v1/report/hours?bogus=1').set('authKey', 'k')).status).toBe(400);
    });
});
