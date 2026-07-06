// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for POST /v1/notification/test (#68) — master-gate + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {},
    ApiKey: {}, ApiMaster: { findOne: vi.fn().mockResolvedValue(null) }, // caller is not a master
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('POST /v1/notification/test contract', () => {
    test('403 without authKey', async () => {
        expect((await request(app).post('/v1/notification/test').send({ to: 'a@b.com' })).status).toBe(403);
    });
    test('403 with a non-master key', async () => {
        expect((await request(app).post('/v1/notification/test').set('authKey', 'scoped').send({ to: 'a@b.com' })).status).toBe(403);
    });
    test('400 on a missing recipient (schema)', async () => {
        expect((await request(app).post('/v1/notification/test').set('authKey', 'k').send({ subject: 'hi' })).status).toBe(400);
    });
    test('400 on an invalid email (schema)', async () => {
        expect((await request(app).post('/v1/notification/test').set('authKey', 'k').send({ to: 'not-an-email' })).status).toBe(400);
    });
});
