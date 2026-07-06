// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for POST /v1/invoice/payment-reminders (#10).

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {},
    Invoice: { findAll: vi.fn().mockResolvedValue([]) },
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

describe('POST /v1/invoice/payment-reminders contract', () => {
    test('403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/invoice/payment-reminders').send({ to: 'ap@client.com' })).status).toBe(403);
    });
    test('400 on a missing recipient (schema)', async () => {
        expect((await request(app).post('/v1/invoice/payment-reminders').set('authKey', 'k').send({ olderThanDays: 30 })).status).toBe(400);
    });
    test('400 on an invalid email (schema)', async () => {
        expect((await request(app).post('/v1/invoice/payment-reminders').set('authKey', 'k').send({ to: 'nope' })).status).toBe(400);
    });
    test('400 on an unknown field (strict schema)', async () => {
        expect((await request(app).post('/v1/invoice/payment-reminders').set('authKey', 'k').send({ to: 'a@b.com', bogus: 1 })).status).toBe(400);
    });
});
