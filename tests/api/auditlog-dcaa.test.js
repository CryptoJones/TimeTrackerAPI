// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for the DCAA audit-trail filters (#462).

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

describe('Audit-trail DCAA filters (#462)', () => {
    test('403 without authKey (valid DCAA query reaches controller)', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/1?entityId=5&actor=master&from=2026-01-01&to=2026-01-31')).status).toBe(403);
    });
    test('400 on a non-numeric entityId (schema)', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/1?entityId=abc').set('authKey', 'k')).status).toBe(400);
    });
    test('400 on a malformed from date (schema)', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/1?from=01-2026').set('authKey', 'k')).status).toBe(400);
    });
    test('400 on an unknown query param (strict)', async () => {
        expect((await request(app).get('/v1/auditlog/bycompany/1?bogus=1').set('authKey', 'k')).status).toBe(400);
    });
});
