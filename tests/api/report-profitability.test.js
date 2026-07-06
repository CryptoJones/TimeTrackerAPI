// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for GET /v1/report/profitability (#436) — auth + schema.

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

describe('GET /v1/report/profitability contract', () => {
    test('403 without authKey', async () => {
        expect((await request(app).get('/v1/report/profitability')).status).toBe(403);
    });
    test('400 on an unknown query parameter (strict schema)', async () => {
        expect((await request(app).get('/v1/report/profitability?bogus=1').set('authKey', 'k')).status).toBe(400);
    });
    test('400 on a non-integer jobId (schema)', async () => {
        expect((await request(app).get('/v1/report/profitability?jobId=abc').set('authKey', 'k')).status).toBe(400);
    });
});
