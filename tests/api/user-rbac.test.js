// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for RBAC on users (#448) — role set + permissions.

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

describe('User RBAC contract (#448)', () => {
    test('PATCH /:id/role 403 without authKey (valid role reaches controller)', async () => {
        expect((await request(app).patch('/v1/user/1/role').send({ userRole: 'admin' })).status).toBe(403);
    });
    test('PATCH /:id/role 400 on an invalid role (schema enum)', async () => {
        expect((await request(app).patch('/v1/user/1/role').set('authKey', 'k').send({ userRole: 'wizard' })).status).toBe(400);
    });
    test('PATCH /:id/role 400 on an unknown field (strict)', async () => {
        expect((await request(app).patch('/v1/user/1/role').set('authKey', 'k').send({ userRole: 'admin', bogus: 1 })).status).toBe(400);
    });
    test('GET /:id/permissions 403 without authKey', async () => {
        expect((await request(app).get('/v1/user/1/permissions')).status).toBe(403);
    });
    test('POST /v1/user 400 on an invalid userRole (schema enum)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ userEmail: 'a@b.com', password: 'longenough1', userRole: 'root' })).status).toBe(400);
    });
    test('POST /v1/user 403 without authKey (valid body incl. userRole)', async () => {
        expect((await request(app).post('/v1/user').send({ userEmail: 'a@b.com', password: 'longenough1', userRole: 'manager' })).status).toBe(403);
    });
});
