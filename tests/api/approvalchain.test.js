// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/approvalchain (#443) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, User: {},
    ApprovalChain: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { apchName: 'Standard', apchLevels: [{ approverRole: 'manager' }, { approverRole: 'owner' }] };

describe('ApprovalChain auth + schema contract (#443)', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/approvalchain').send(good)).status).toBe(403);
    });
    test('POST 400 on empty levels (schema min 1)', async () => {
        expect((await request(app).post('/v1/approvalchain').set('authKey', 'k').send({ apchName: 'X', apchLevels: [] })).status).toBe(400);
    });
    test('POST 400 on an invalid approver role (schema enum)', async () => {
        expect((await request(app).post('/v1/approvalchain').set('authKey', 'k').send({ apchName: 'X', apchLevels: [{ approverRole: 'wizard' }] })).status).toBe(400);
    });
    test('GET /:id/next 403 without authKey', async () => {
        expect((await request(app).get('/v1/approvalchain/1/next?approvals=0')).status).toBe(403);
    });
    test('GET /:id/next 400 without approvals (schema required)', async () => {
        expect((await request(app).get('/v1/approvalchain/1/next').set('authKey', 'k')).status).toBe(400);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/approvalchain/1')).status).toBe(403);
    });
});
