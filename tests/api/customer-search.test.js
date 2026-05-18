// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for GET /v1/customer/search. Same constraint as the
// other API tests: vi.mock on db.config.js doesn't intercept the
// nested CJS require chain, so behavioral testing (real ILIKE
// matching) lives in tests/integration. What this file asserts:
//
//   - auth contract (403 / 400 paths the test env can drive
//     without a working DB mock)
//   - query-param validation via zod middleware
//   - route is mounted (not 404, no double-response)

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: { Op: { or: Symbol('or'), iLike: Symbol('iLike') } },
    Customer: {
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
    },
    TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {},
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

describe('GET /v1/customer/search auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).get('/v1/customer/search?q=acme');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Authorization key not sent/i);
    });
});

describe('GET /v1/customer/search query validation', () => {
    test('q is required (400 when missing)', async () => {
        const res = await request(app)
            .get('/v1/customer/search')
            .set('authKey', 'any');
        expect(res.status).toBe(400);
    });

    test('q is too short — < 2 chars rejected (400)', async () => {
        const res = await request(app)
            .get('/v1/customer/search?q=a')
            .set('authKey', 'any');
        expect(res.status).toBe(400);
    });

    test('q at the 2-char minimum is accepted (passes validation)', async () => {
        const res = await request(app)
            .get('/v1/customer/search?q=ab')
            .set('authKey', 'any');
        // 400 would mean schema rejected; anything else means schema passed.
        expect(res.status).not.toBe(400);
    });

    test('unknown query param is rejected via .strict()', async () => {
        const res = await request(app)
            .get('/v1/customer/search?q=acme&bogus=1')
            .set('authKey', 'any');
        expect(res.status).toBe(400);
    });

    test('limit cap enforced — > 500 rejected', async () => {
        const res = await request(app)
            .get('/v1/customer/search?q=acme&limit=10000')
            .set('authKey', 'any');
        expect(res.status).toBe(400);
    });
});

describe('GET /v1/customer/search route mounting', () => {
    test('route is mounted; not treated as /v1/customer/:id', async () => {
        // If the route ordering were wrong, "search" would be parsed as
        // an :id param and intIdParam would 400 with a different message.
        const res = await request(app)
            .get('/v1/customer/search?q=acme')
            .set('authKey', 'any');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
        // 400 from intIdParam would say "expected positive integer";
        // search's own body errors are different (and we pass validation
        // with q=acme anyway).
        if (res.status === 400) {
            expect(res.body.message).not.toMatch(/positive/i);
        }
    });
});
