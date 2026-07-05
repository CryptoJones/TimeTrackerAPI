// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for time-entry tags (#406) — schema acceptance
// and rejection on create + the ?tag= list filter.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: { gte: Symbol('gte'), lte: Symbol('lte'), contains: Symbol('contains') } },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {},
    TimeEntry: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
    ApiKey: {}, ApiMaster: {},
}));

let app;

const validBody = (extra) => ({ teCustId: 1, teStartedAt: '2026-07-01T00:00:00Z', ...extra });

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('Time-entry tags contract', () => {
    test('POST /v1/timeentry accepts teTags (valid body → 403 without authKey, schema passed)', async () => {
        const res = await request(app).post('/v1/timeentry').send(validBody({ teTags: ['urgent', 'client-x'] }));
        expect(res.status).toBe(403);
    });
    test('POST /v1/timeentry 400 on a non-string tag (schema)', async () => {
        const res = await request(app).post('/v1/timeentry').set('authKey', 'k').send(validBody({ teTags: [123] }));
        expect(res.status).toBe(400);
    });
    test('POST /v1/timeentry 400 when teTags is not an array (schema)', async () => {
        const res = await request(app).post('/v1/timeentry').set('authKey', 'k').send(validBody({ teTags: 'urgent' }));
        expect(res.status).toBe(400);
    });
    test('GET /v1/timeentry/bycompany/:id accepts ?tag= (403 without authKey, schema passed)', async () => {
        expect((await request(app).get('/v1/timeentry/bycompany/1?tag=urgent')).status).toBe(403);
    });
    test('GET /v1/timeentry/bycompany/:id 400 on an over-long tag (schema)', async () => {
        const long = 'x'.repeat(65);
        const res = await request(app).get(`/v1/timeentry/bycompany/1?tag=${long}`).set('authKey', 'k');
        expect(res.status).toBe(400);
    });
});
