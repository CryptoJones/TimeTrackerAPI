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

describe('escapeLikeWildcards helper', () => {
    // Pinning the escape because Sequelize's Op.iLike does NOT
    // auto-escape SQL LIKE metacharacters. A future helper rewrite
    // that accidentally drops the escape on `%` would silently turn
    // the substring search into a pattern search — same auth scope
    // still applies, but the intent of "match substring q" breaks.
    let escapeLikeWildcards;
    beforeAll(async () => {
        const ctrl = await import('../../app/controllers/customercontroller.js');
        escapeLikeWildcards = ctrl._helpers.escapeLikeWildcards;
    });
    test('escapes the three LIKE metacharacters: %, _, backslash', () => {
        expect(escapeLikeWildcards('%')).toBe('\\%');
        expect(escapeLikeWildcards('_')).toBe('\\_');
        expect(escapeLikeWildcards('\\')).toBe('\\\\');
    });
    test('leaves ordinary text alone', () => {
        expect(escapeLikeWildcards('Acme Corp')).toBe('Acme Corp');
        expect(escapeLikeWildcards('john.doe@example.com')).toBe('john.doe@example.com');
    });
    test('escapes multiple metacharacters in one string', () => {
        expect(escapeLikeWildcards('100%_done')).toBe('100\\%\\_done');
        expect(escapeLikeWildcards('path\\to\\file')).toBe('path\\\\to\\\\file');
    });
    test('coerces non-string to string before escaping (defensive)', () => {
        // Schema validation already enforces string, but the helper
        // defensively coerces so a runtime mis-call doesn't throw.
        expect(escapeLikeWildcards(null)).toBe('null');
        expect(escapeLikeWildcards(undefined)).toBe('undefined');
        expect(escapeLikeWildcards(42)).toBe('42');
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
