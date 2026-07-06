// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/receipt (#419) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, User: {},
    Receipt: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

// A tiny valid base64 PNG-ish blob.
const B64 = Buffer.from('hello-receipt').toString('base64');
const good = { expId: 1, filename: 'lunch.png', contentType: 'image/png', dataBase64: B64 };

describe('Receipt auth + schema contract', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/receipt').send(good)).status).toBe(403);
    });
    test('POST 400 on missing expId (schema)', async () => {
        expect((await request(app).post('/v1/receipt').set('authKey', 'k').send({ filename: 'x.png', contentType: 'image/png', dataBase64: B64 })).status).toBe(400);
    });
    test('POST 400 on an unsupported contentType (schema enum)', async () => {
        expect((await request(app).post('/v1/receipt').set('authKey', 'k').send({ ...good, contentType: 'application/x-msdownload' })).status).toBe(400);
    });
    test('POST 400 on non-base64 data (schema)', async () => {
        expect((await request(app).post('/v1/receipt').set('authKey', 'k').send({ ...good, dataBase64: 'not base64!!' })).status).toBe(400);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/receipt/1')).status).toBe(403);
    });
    test('GET /:id/download 403 without authKey', async () => {
        expect((await request(app).get('/v1/receipt/1/download')).status).toBe(403);
    });
    test('GET /byexpense/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/receipt/byexpense/1')).status).toBe(403);
    });
});
