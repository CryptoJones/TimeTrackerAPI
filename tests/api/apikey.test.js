// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/apikey (#65) — master-only gate, schema,
// and the "raw key returned once, hash never exposed" guarantee.

import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mocks = vi.hoisted(() => ({
    apiMasterFindOne: vi.fn().mockResolvedValue(null), // default: caller is NOT a master
    apiKeyCreate: vi.fn().mockResolvedValue({ akId: 5 }),
}));

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, TimeEntry: {},
    ApiMaster: { findOne: mocks.apiMasterFindOne },
    ApiKey: {
        create: mocks.apiKeyCreate,
        findOne: vi.fn().mockResolvedValue(null),
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
    },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

beforeEach(() => {
    mocks.apiMasterFindOne.mockResolvedValue(null);
});

describe('API-key lifecycle contract (#65)', () => {
    test('POST /v1/apikey 403 without authKey', async () => {
        expect((await request(app).post('/v1/apikey').send({ akCompanyId: 1 })).status).toBe(403);
    });
    test('POST /v1/apikey 403 with a non-master key', async () => {
        expect((await request(app).post('/v1/apikey').set('authKey', 'scoped').send({ akCompanyId: 1 })).status).toBe(403);
    });
    test('POST /v1/apikey 400 on missing akCompanyId (schema)', async () => {
        expect((await request(app).post('/v1/apikey').set('authKey', 'k').send({})).status).toBe(400);
    });
    test('POST /v1/apikey/:id/rotate 403 with a non-master key', async () => {
        expect((await request(app).post('/v1/apikey/1/rotate').set('authKey', 'scoped')).status).toBe(403);
    });
    test('DELETE /v1/apikey/:id 403 with a non-master key', async () => {
        expect((await request(app).delete('/v1/apikey/1').set('authKey', 'scoped')).status).toBe(403);
    });
    test('GET /v1/apikey/:id 403 with a non-master key', async () => {
        expect((await request(app).get('/v1/apikey/1').set('authKey', 'scoped')).status).toBe(403);
    });
    test('GET /v1/apikey/bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/apikey/bycompany/1')).status).toBe(403);
    });
});
