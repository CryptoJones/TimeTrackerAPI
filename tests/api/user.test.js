// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/user (#444) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {},
    User: { findByPk: vi.fn().mockResolvedValue(null), findOne: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { userEmail: 'jane@co.com', password: 'hunter2hunter2' };

describe('User account auth + schema contract', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/user').send(good)).status).toBe(403);
    });
    test('POST 400 on a missing password (schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ userEmail: 'jane@co.com' })).status).toBe(400);
    });
    test('POST 400 on a too-short password (schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ userEmail: 'jane@co.com', password: 'short' })).status).toBe(400);
    });
    test('POST 400 on an invalid email (schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ userEmail: 'not-an-email', password: 'hunter2hunter2' })).status).toBe(400);
    });
    test('POST 400 on an unknown field (strict schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ ...good, isAdmin: true })).status).toBe(400);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/user/1')).status).toBe(403);
    });
    test('GET /bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/user/bycompany/1')).status).toBe(403);
    });
});
