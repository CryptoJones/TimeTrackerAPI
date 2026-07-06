// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/invitation (#458) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, ApprovalChain: {}, User: {},
    Invitation: { findByPk: vi.fn().mockResolvedValue(null), findOne: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { invtEmail: 'new@co.com', invtRole: 'member' };

describe('Invitation auth + schema contract (#458)', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/invitation').send(good)).status).toBe(403);
    });
    test('POST 400 on an invalid role (schema enum)', async () => {
        expect((await request(app).post('/v1/invitation').set('authKey', 'k').send({ invtEmail: 'new@co.com', invtRole: 'wizard' })).status).toBe(400);
    });
    test('POST 400 on a bad email (schema)', async () => {
        expect((await request(app).post('/v1/invitation').set('authKey', 'k').send({ invtEmail: 'nope', invtRole: 'member' })).status).toBe(400);
    });
    test('POST /accept 400 on a missing password (schema)', async () => {
        expect((await request(app).post('/v1/invitation/accept').send({ token: 'abc' })).status).toBe(400);
    });
    test('POST /accept 400 on a too-short password (schema)', async () => {
        expect((await request(app).post('/v1/invitation/accept').send({ token: 'abc', password: 'short' })).status).toBe(400);
    });
    test('GET /bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/invitation/bycompany/1')).status).toBe(403);
    });
    test('DELETE /:id 403 without authKey', async () => {
        expect((await request(app).delete('/v1/invitation/1')).status).toBe(403);
    });
});
