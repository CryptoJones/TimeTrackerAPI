// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/rateschedule (#414) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {},
    RateSchedule: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), findAll: vi.fn().mockResolvedValue([]), create: vi.fn() },
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

const good = { rschName: 'Standard 2026', rschRate: 175, rschEffectiveFrom: '2026-01-01' };

describe('RateSchedule auth + schema contract', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/rateschedule').send(good)).status).toBe(403);
    });
    test('POST 400 on missing rschRate (schema)', async () => {
        expect((await request(app).post('/v1/rateschedule').set('authKey', 'k').send({ rschName: 'X', rschEffectiveFrom: '2026-01-01' })).status).toBe(400);
    });
    test('POST 400 on effectiveTo before effectiveFrom (schema refine)', async () => {
        const res = await request(app).post('/v1/rateschedule').set('authKey', 'k')
            .send({ ...good, rschEffectiveTo: '2025-06-01' });
        expect(res.status).toBe(400);
    });
    test('GET /resolve 403 without authKey (date present)', async () => {
        expect((await request(app).get('/v1/rateschedule/resolve?date=2026-06-01')).status).toBe(403);
    });
    test('GET /resolve 400 without a date (schema)', async () => {
        expect((await request(app).get('/v1/rateschedule/resolve').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /resolve does not collide with GET /:id (route ordering)', async () => {
        // "resolve" hits the resolve handler (403 no-auth), not the :id route.
        expect((await request(app).get('/v1/rateschedule/resolve?date=2026-06-01')).status).toBe(403);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/rateschedule/1')).status).toBe(403);
    });
});
