// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/role (#412) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, TimeEntry: {},
    Role: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

describe('Role auth + schema contract', () => {
    test('POST /v1/role 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/role').send({ roleName: 'Senior Consultant', roleRate: 250 })).status).toBe(403);
    });
    test('POST /v1/role 400 on missing roleName (schema)', async () => {
        expect((await request(app).post('/v1/role').set('authKey', 'k').send({ roleRate: 250 })).status).toBe(400);
    });
    test('POST /v1/role 400 on a non-positive roleRate (schema)', async () => {
        expect((await request(app).post('/v1/role').set('authKey', 'k').send({ roleName: 'X', roleRate: 0 })).status).toBe(400);
    });
    test('POST /v1/role 400 on an unknown field (strict schema)', async () => {
        expect((await request(app).post('/v1/role').set('authKey', 'k').send({ roleName: 'X', bogus: 1 })).status).toBe(400);
    });
    test('GET /v1/role/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/role/1')).status).toBe(403);
    });
    test('GET /v1/role/bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/role/bycompany/1')).status).toBe(403);
    });
});
