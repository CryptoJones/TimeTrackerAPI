// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/gdpr (#461) — auth + param validation.

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

describe('GDPR export/erase contract (#461)', () => {
    test('GET export 403 without authKey', async () => {
        expect((await request(app).get('/v1/gdpr/customer/1/export')).status).toBe(403);
    });
    test('POST erase 403 without authKey', async () => {
        expect((await request(app).post('/v1/gdpr/customer/1/erase')).status).toBe(403);
    });
    test('GET export 400 on a non-numeric id (schema)', async () => {
        expect((await request(app).get('/v1/gdpr/customer/abc/export').set('authKey', 'k')).status).toBe(400);
    });
    test('POST erase 400 on a non-numeric id (schema)', async () => {
        expect((await request(app).post('/v1/gdpr/customer/abc/erase').set('authKey', 'k')).status).toBe(400);
    });
});
