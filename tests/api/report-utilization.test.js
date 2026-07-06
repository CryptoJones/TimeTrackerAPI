// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for GET /v1/report/utilization (#53) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {},
    TimeEntry: { findAll: vi.fn().mockResolvedValue([]) },
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

describe('GET /v1/report/utilization contract', () => {
    test('403 without authKey (from/to present)', async () => {
        expect((await request(app).get('/v1/report/utilization?from=2026-01-01&to=2026-01-31')).status).toBe(403);
    });
    test('400 when from/to are missing (schema requires them)', async () => {
        expect((await request(app).get('/v1/report/utilization').set('authKey', 'k')).status).toBe(400);
    });
    test('400 on an unknown query parameter (strict schema)', async () => {
        const res = await request(app).get('/v1/report/utilization?from=2026-01-01&to=2026-01-31&bogus=1').set('authKey', 'k');
        expect(res.status).toBe(400);
    });
});
