// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/payroll (#456) — auth + query validation.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, User: {},
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

describe('Payroll export contract (#456)', () => {
    test('GET /summary 403 without authKey (valid query reaches controller)', async () => {
        expect((await request(app).get('/v1/payroll/summary?from=2026-01-01&to=2026-01-15')).status).toBe(403);
    });
    test('GET /export 403 without authKey', async () => {
        expect((await request(app).get('/v1/payroll/export?from=2026-01-01&to=2026-01-15')).status).toBe(403);
    });
    test('GET /summary 400 on a missing from (schema)', async () => {
        expect((await request(app).get('/v1/payroll/summary?to=2026-01-15').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /export 400 on a malformed date (schema)', async () => {
        expect((await request(app).get('/v1/payroll/export?from=01-01-2026&to=2026-01-15').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /summary 400 on an unknown query param (strict)', async () => {
        expect((await request(app).get('/v1/payroll/summary?from=2026-01-01&to=2026-01-15&bogus=1').set('authKey', 'k')).status).toBe(400);
    });
});
