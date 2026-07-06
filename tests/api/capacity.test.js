// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/capacity (#459) — auth + query validation.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, ApprovalChain: {}, Invitation: {}, User: {},
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

describe('Capacity report contract (#459)', () => {
    test('GET /summary 403 without authKey (valid query reaches controller)', async () => {
        expect((await request(app).get('/v1/capacity/summary?from=2026-01-01&to=2026-01-14')).status).toBe(403);
    });
    test('GET /summary 400 on a missing from (schema)', async () => {
        expect((await request(app).get('/v1/capacity/summary?to=2026-01-14').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /summary 400 on a malformed date (schema)', async () => {
        expect((await request(app).get('/v1/capacity/summary?from=Jan-1&to=2026-01-14').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /summary 400 on an unknown query param (strict)', async () => {
        expect((await request(app).get('/v1/capacity/summary?from=2026-01-01&to=2026-01-14&bogus=1').set('authKey', 'k')).status).toBe(400);
    });
});
