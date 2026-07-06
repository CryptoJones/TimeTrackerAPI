// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/recurringinvoice (#425) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, TimeEntry: {},
    RecurringInvoice: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { recinvCustId: 1, recinvCadence: 'monthly', recinvNextRun: '2026-02-01' };

describe('RecurringInvoice auth + schema contract', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/recurringinvoice').send(good)).status).toBe(403);
    });
    test('POST 400 on missing recinvCadence (schema)', async () => {
        expect((await request(app).post('/v1/recurringinvoice').set('authKey', 'k').send({ recinvCustId: 1, recinvNextRun: '2026-02-01' })).status).toBe(400);
    });
    test('POST 400 on an invalid cadence enum (schema)', async () => {
        expect((await request(app).post('/v1/recurringinvoice').set('authKey', 'k').send({ ...good, recinvCadence: 'fortnightly' })).status).toBe(400);
    });
    test('POST 400 on a bad recinvNextRun date (schema)', async () => {
        expect((await request(app).post('/v1/recurringinvoice').set('authKey', 'k').send({ ...good, recinvNextRun: 'soon' })).status).toBe(400);
    });
    test('GET /due 403 without authKey', async () => {
        expect((await request(app).get('/v1/recurringinvoice/due')).status).toBe(403);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/recurringinvoice/1')).status).toBe(403);
    });
    test('POST /:id/run 403 without authKey', async () => {
        expect((await request(app).post('/v1/recurringinvoice/1/run')).status).toBe(403);
    });
    test('GET /due does not collide with GET /:id (route ordering)', async () => {
        // "due" must hit listDue (403 no-auth), NOT the :id param route (which
        // would 400 on a non-integer id).
        expect((await request(app).get('/v1/recurringinvoice/due')).status).toBe(403);
    });
});
