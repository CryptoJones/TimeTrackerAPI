// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for GET /v1/report/revenue.pdf (#433) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, TimeEntry: {},
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

describe('GET /v1/report/revenue.pdf contract', () => {
    test('403 without authKey', async () => {
        expect((await request(app).get('/v1/report/revenue.pdf')).status).toBe(403);
    });
    test('400 on an unknown query parameter (strict schema)', async () => {
        expect((await request(app).get('/v1/report/revenue.pdf?bogus=1').set('authKey', 'k')).status).toBe(400);
    });
    test('the JSON revenue route still resolves separately (no .pdf collision)', async () => {
        // Both routes exist; the .pdf suffix does not shadow the JSON route.
        expect((await request(app).get('/v1/report/revenue')).status).toBe(403);
    });
});
