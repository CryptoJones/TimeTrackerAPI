// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/billablerule (#415) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, ApprovalChain: {}, Invitation: {}, CustomFieldDef: {}, User: {},
    BillableRule: { findByPk: vi.fn().mockResolvedValue(null), findAll: vi.fn().mockResolvedValue([]), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { bruName: 'Travel is non-billable', bruMatchCategory: 'travel', bruBillable: false };

describe('BillableRule auth + schema contract (#415)', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/billablerule').send(good)).status).toBe(403);
    });
    test('POST 400 on a missing bruBillable (schema)', async () => {
        expect((await request(app).post('/v1/billablerule').set('authKey', 'k').send({ bruName: 'X', bruMatchCategory: 'travel' })).status).toBe(400);
    });
    test('POST 400 on a non-boolean bruBillable (schema)', async () => {
        expect((await request(app).post('/v1/billablerule').set('authKey', 'k').send({ bruName: 'X', bruBillable: 'yes' })).status).toBe(400);
    });
    test('POST /evaluate 403 without authKey', async () => {
        expect((await request(app).post('/v1/billablerule/evaluate').send({ jobId: 7 })).status).toBe(403);
    });
    test('POST /evaluate 400 on an unknown field (strict)', async () => {
        expect((await request(app).post('/v1/billablerule/evaluate').set('authKey', 'k').send({ jobId: 7, bogus: 1 })).status).toBe(400);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/billablerule/1')).status).toBe(403);
    });
});
