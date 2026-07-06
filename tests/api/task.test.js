// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/task (#407) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, TimeEntry: {},
    Task: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

describe('Task auth + schema contract', () => {
    test('POST /v1/task 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/task').send({ taskJobId: 1, taskName: 'Design' })).status).toBe(403);
    });
    test('POST /v1/task 400 on missing taskName (schema)', async () => {
        expect((await request(app).post('/v1/task').set('authKey', 'k').send({ taskJobId: 1 })).status).toBe(400);
    });
    test('POST /v1/task 400 on an unknown field (strict schema)', async () => {
        const res = await request(app).post('/v1/task').set('authKey', 'k').send({ taskJobId: 1, taskName: 'X', bogus: 1 });
        expect(res.status).toBe(400);
    });
    test('GET /v1/task/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/task/1')).status).toBe(403);
    });
    test('GET /v1/task/byjob/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/task/byjob/1')).status).toBe(403);
    });
    test('PATCH /v1/task/:id 403 without authKey', async () => {
        expect((await request(app).patch('/v1/task/1').send({ taskName: 'Y' })).status).toBe(403);
    });
});
