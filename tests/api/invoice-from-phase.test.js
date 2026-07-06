// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for POST /v1/invoice/from-phase (#428) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' }, transaction: vi.fn() },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, InvoiceJob: {},
    Phase: { findByPk: vi.fn().mockResolvedValue(null) },
    Invoice: { findAll: vi.fn().mockResolvedValue([]) },
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

describe('POST /v1/invoice/from-phase contract', () => {
    test('403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/invoice/from-phase').send({ phaseId: 1 })).status).toBe(403);
    });
    test('400 on a missing phaseId (schema)', async () => {
        expect((await request(app).post('/v1/invoice/from-phase').set('authKey', 'k').send({ invDate: '2026-01-01' })).status).toBe(400);
    });
    test('400 on a bad currency (schema)', async () => {
        expect((await request(app).post('/v1/invoice/from-phase').set('authKey', 'k').send({ phaseId: 1, currency: 'dollars' })).status).toBe(400);
    });
    test('400 on a tax rate above 1 (schema; rate is a fraction)', async () => {
        expect((await request(app).post('/v1/invoice/from-phase').set('authKey', 'k').send({ phaseId: 1, taxRate: 20 })).status).toBe(400);
    });
    test('400 on a due date before the issue date (schema refine)', async () => {
        const res = await request(app).post('/v1/invoice/from-phase').set('authKey', 'k')
            .send({ phaseId: 1, invDate: '2026-03-01', invDueDate: '2026-02-01' });
        expect(res.status).toBe(400);
    });
});
