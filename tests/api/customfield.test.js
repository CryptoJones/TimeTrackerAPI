// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/customfield (#409) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, ApprovalChain: {}, Invitation: {}, User: {},
    CustomFieldDef: { findByPk: vi.fn().mockResolvedValue(null), findOne: vi.fn().mockResolvedValue(null), findAll: vi.fn().mockResolvedValue([]), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { cfdEntity: 'customer', cfdName: 'region', cfdType: 'text' };

describe('CustomFieldDef auth + schema contract (#409)', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/customfield').send(good)).status).toBe(403);
    });
    test('POST 400 on an invalid entity (schema enum)', async () => {
        expect((await request(app).post('/v1/customfield').set('authKey', 'k').send({ ...good, cfdEntity: 'invoice' })).status).toBe(400);
    });
    test('POST 400 on an invalid type (schema enum)', async () => {
        expect((await request(app).post('/v1/customfield').set('authKey', 'k').send({ ...good, cfdType: 'json' })).status).toBe(400);
    });
    test('POST 400 on a bad field name (schema regex)', async () => {
        expect((await request(app).post('/v1/customfield').set('authKey', 'k').send({ ...good, cfdName: '1bad name' })).status).toBe(400);
    });
    test('POST /validate 403 without authKey', async () => {
        expect((await request(app).post('/v1/customfield/validate').send({ entity: 'customer', values: {} })).status).toBe(403);
    });
    test('POST /validate 400 on a missing values object (schema)', async () => {
        expect((await request(app).post('/v1/customfield/validate').set('authKey', 'k').send({ entity: 'customer' })).status).toBe(400);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/customfield/1')).status).toBe(403);
    });
});
