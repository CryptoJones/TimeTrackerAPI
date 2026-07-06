// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for the audit-log read endpoint (#460).

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, TimeEntry: {},
    AuditLog: { findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }) },
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

describe('Audit-log read contract', () => {
    test('GET /v1/auditlog/bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/1')).status).toBe(403);
    });
    test('GET /v1/auditlog/bycompany/:id rejects an unknown query param (schema)', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/1?bogus=1').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /v1/auditlog/bycompany/:id rejects an invalid method filter (schema)', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/1?method=GET').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /v1/auditlog/bycompany/:id rejects a non-integer id (schema)', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/abc').set('authKey', 'k')).status).toBe(400);
    });
});
