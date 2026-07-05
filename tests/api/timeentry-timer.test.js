// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for the timer endpoints (#396) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: { ne: Symbol('ne') } },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {},
    TimeEntry: { findByPk: vi.fn().mockResolvedValue(null), findOne: vi.fn(), create: vi.fn() },
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

describe('Timer endpoints auth + schema contract', () => {
    test('POST /v1/timeentry/start 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/timeentry/start').send({ teCustId: 1 })).status).toBe(403);
    });
    test('POST /v1/timeentry/start 400 on missing teCustId (schema)', async () => {
        expect((await request(app).post('/v1/timeentry/start').set('authKey', 'k').send({})).status).toBe(400);
    });
    test('POST /v1/timeentry/start 400 rejects server-managed teStartedAt (strict schema)', async () => {
        const res = await request(app).post('/v1/timeentry/start').set('authKey', 'k')
            .send({ teCustId: 1, teStartedAt: '2026-07-01T00:00:00Z' });
        expect(res.status).toBe(400);
    });
    test('POST /v1/timeentry/:id/stop 403 without authKey', async () => {
        expect((await request(app).post('/v1/timeentry/1/stop')).status).toBe(403);
    });
});
