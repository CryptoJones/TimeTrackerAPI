// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/reportschedule (#57) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, User: {}, Receipt: {},
    ReportSchedule: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { rptschReport: 'revenue', rptschTo: 'boss@co.com', rptschCadence: 'monthly', rptschNextRun: '2026-02-01' };

describe('ReportSchedule auth + schema contract', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/reportschedule').send(good)).status).toBe(403);
    });
    test('POST 400 on missing rptschTo (schema)', async () => {
        expect((await request(app).post('/v1/reportschedule').set('authKey', 'k').send({ rptschReport: 'revenue', rptschCadence: 'monthly', rptschNextRun: '2026-02-01' })).status).toBe(400);
    });
    test('POST 400 on an invalid report (schema enum)', async () => {
        expect((await request(app).post('/v1/reportschedule').set('authKey', 'k').send({ ...good, rptschReport: 'made-up' })).status).toBe(400);
    });
    test('POST 400 on an invalid cadence (schema enum)', async () => {
        expect((await request(app).post('/v1/reportschedule').set('authKey', 'k').send({ ...good, rptschCadence: 'hourly' })).status).toBe(400);
    });
    test('GET /due 403 without authKey', async () => {
        expect((await request(app).get('/v1/reportschedule/due')).status).toBe(403);
    });
    test('POST /:id/run 403 without authKey', async () => {
        expect((await request(app).post('/v1/reportschedule/1/run')).status).toBe(403);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/reportschedule/1')).status).toBe(403);
    });
});
