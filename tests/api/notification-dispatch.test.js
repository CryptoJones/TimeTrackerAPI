// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for POST /v1/notification/dispatch (#454).

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

describe('Notification dispatch contract (#454)', () => {
    test('403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/notification/dispatch').send({ channel: 'slack', text: 'hi' })).status).toBe(403);
    });
    test('400 on an invalid channel (schema enum)', async () => {
        expect((await request(app).post('/v1/notification/dispatch').set('authKey', 'k').send({ channel: 'sms', text: 'hi' })).status).toBe(400);
    });
    test('400 on empty text (schema)', async () => {
        expect((await request(app).post('/v1/notification/dispatch').set('authKey', 'k').send({ channel: 'slack', text: '' })).status).toBe(400);
    });
    test('400 on an unknown field (strict)', async () => {
        expect((await request(app).post('/v1/notification/dispatch').set('authKey', 'k').send({ channel: 'slack', text: 'hi', bogus: 1 })).status).toBe(400);
    });
});
