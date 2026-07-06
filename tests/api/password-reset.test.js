// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP schema tests for password reset (#446). The db-touching branches
// (request-with-real-user, confirm) can't be injected via this repo's api
// mock (see login.test.js) — covered by the password-reset unit tests.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, User: {},
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

describe('password reset schema contract (#446)', () => {
    test('request 400 on a missing companyId', async () => {
        expect((await request(app).post('/v1/password-reset/request').send({ userEmail: 'a@b.com' })).status).toBe(400);
    });
    test('request 400 on a bad email', async () => {
        expect((await request(app).post('/v1/password-reset/request').send({ userEmail: 'nope', companyId: 5 })).status).toBe(400);
    });
    test('request 400 on an unknown field (strict)', async () => {
        expect((await request(app).post('/v1/password-reset/request').send({ userEmail: 'a@b.com', companyId: 5, bogus: 1 })).status).toBe(400);
    });
    test('confirm 400 on a missing token', async () => {
        expect((await request(app).post('/v1/password-reset/confirm').send({ newPassword: 'longenough1' })).status).toBe(400);
    });
    test('confirm 400 on a too-short new password', async () => {
        expect((await request(app).post('/v1/password-reset/confirm').send({ token: 'abc', newPassword: 'short' })).status).toBe(400);
    });
});
