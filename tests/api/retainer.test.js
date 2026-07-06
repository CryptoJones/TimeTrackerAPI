// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/retainer (#426) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, TimeEntry: {},
    Retainer: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

describe('Retainer auth + schema contract', () => {
    test('POST /v1/retainer 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/retainer').send({ retCustId: 1, retAmount: 1000 })).status).toBe(403);
    });
    test('POST /v1/retainer 400 on missing retAmount (schema)', async () => {
        expect((await request(app).post('/v1/retainer').set('authKey', 'k').send({ retCustId: 1 })).status).toBe(400);
    });
    test('POST /v1/retainer 400 on a non-positive retAmount (schema)', async () => {
        expect((await request(app).post('/v1/retainer').set('authKey', 'k').send({ retCustId: 1, retAmount: 0 })).status).toBe(400);
    });
    test('POST /v1/retainer/:id/drawdown 403 without authKey (valid body)', async () => {
        expect((await request(app).post('/v1/retainer/1/drawdown').send({ amount: 100 })).status).toBe(403);
    });
    test('POST /v1/retainer/:id/drawdown 400 on a non-positive amount (schema)', async () => {
        expect((await request(app).post('/v1/retainer/1/drawdown').set('authKey', 'k').send({ amount: -5 })).status).toBe(400);
    });
    test('GET /v1/retainer/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/retainer/1')).status).toBe(403);
    });
    test('GET /v1/retainer/bycustomer/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/retainer/bycustomer/1')).status).toBe(403);
    });
});
