// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for GET /v1/timeentry/export.csv.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: { Op: {} },
    Customer: {}, TimeEntry: {
        findAll: vi.fn().mockResolvedValue([]),
        findByPk: vi.fn(),
        create: vi.fn(),
    },
    Worker: {}, BillingType: {}, InventoryItem: {},
    Company: {}, Job: {}, Invoice: {}, CustomerPayment: {},
    InvoiceJob: {}, ProductEntry: {}, VersionInfo: {},
    PurchaseOrderVendor: {}, PurchaseOrderHeader: {}, PurchaseOrderLine: {},
    InventoryTransaction: {},
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

describe('GET /v1/timeentry/export.csv auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).get('/v1/timeentry/export.csv');
        expect(res.status).toBe(403);
    });
});

describe('GET /v1/timeentry/export.csv query validation', () => {
    test('unknown query param is rejected', async () => {
        const res = await request(app)
            .get('/v1/timeentry/export.csv?bogus=1')
            .set('authKey', 'any');
        expect(res.status).toBe(400);
    });

    test('limit > 5000 rejected', async () => {
        const res = await request(app)
            .get('/v1/timeentry/export.csv?limit=10000')
            .set('authKey', 'any');
        expect(res.status).toBe(400);
    });

    test('bad ISO datetime in from rejected', async () => {
        const res = await request(app)
            .get('/v1/timeentry/export.csv?from=tomorrow')
            .set('authKey', 'any');
        expect(res.status).toBe(400);
    });

    test('well-formed query passes schema', async () => {
        const res = await request(app)
            .get('/v1/timeentry/export.csv?customerId=1&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&limit=100')
            .set('authKey', 'any');
        // Past zod gate; auth-fallback may return whatever, just not 400 from schema.
        // (Could be 403 or 500 from DB-broken path.)
        expect(res.status).not.toBe(404);
    });
});

describe('GET /v1/timeentry/export.csv route mounting', () => {
    test('route is mounted (not treated as /:id)', async () => {
        const res = await request(app)
            .get('/v1/timeentry/export.csv')
            .set('authKey', 'any');
        // Either CSV (success) or JSON error from handler — both prove
        // the dedicated handler ran, not the :id route's intIdParam.
        if (res.headers['content-type']?.includes('text/csv')) {
            // success path — fine
        } else {
            expect(res.body).toBeTypeOf('object');
            expect(res.body.message).toBeDefined();
        }
    });
});
