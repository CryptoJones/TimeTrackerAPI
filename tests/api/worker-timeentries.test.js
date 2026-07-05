// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for GET /v1/worker/:id/timeentries (#397).

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: { gte: Symbol('gte'), lte: Symbol('lte') } },
    Customer: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {},
    Worker: { findByPk: vi.fn().mockResolvedValue(null) },
    TimeEntry: { findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }) },
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

describe('Worker time-list route auth + schema', () => {
    test('GET /v1/worker/:id/timeentries 403 without authKey', async () => {
        expect((await request(app).get('/v1/worker/1/timeentries')).status).toBe(403);
    });
    test('GET /v1/worker/:id/timeentries rejects an unknown query param (schema)', async () => {
        const res = await request(app).get('/v1/worker/1/timeentries?bogus=1').set('authKey', 'k');
        expect(res.status).toBe(400);
    });
    test('GET /v1/worker/:id/timeentries rejects a non-integer id (schema)', async () => {
        const res = await request(app).get('/v1/worker/abc/timeentries').set('authKey', 'k');
        expect(res.status).toBe(400);
    });
});
