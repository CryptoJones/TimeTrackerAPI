// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/webhook (#69) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, TimeEntry: {},
    Webhook: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { whkUrl: 'https://example.com/hook', whkEvent: 'invoice.created' };

describe('Webhook auth + schema contract', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/webhook').send(good)).status).toBe(403);
    });
    test('POST 400 on missing whkUrl (schema)', async () => {
        expect((await request(app).post('/v1/webhook').set('authKey', 'k').send({ whkEvent: 'invoice.created' })).status).toBe(400);
    });
    test('POST 400 on a non-URL whkUrl (schema)', async () => {
        expect((await request(app).post('/v1/webhook').set('authKey', 'k').send({ ...good, whkUrl: 'not-a-url' })).status).toBe(400);
    });
    test('POST 400 on an unknown event (schema enum)', async () => {
        expect((await request(app).post('/v1/webhook').set('authKey', 'k').send({ ...good, whkEvent: 'coffee.brewed' })).status).toBe(400);
    });
    test('POST 400 on a too-short whkSecret (schema)', async () => {
        expect((await request(app).post('/v1/webhook').set('authKey', 'k').send({ ...good, whkSecret: 'short' })).status).toBe(400);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/webhook/1')).status).toBe(403);
    });
    test('GET /bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/webhook/bycompany/1')).status).toBe(403);
    });
    test('POST /:id/ping 403 without authKey', async () => {
        expect((await request(app).post('/v1/webhook/1/ping')).status).toBe(403);
    });
});
