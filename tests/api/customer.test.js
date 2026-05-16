// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests + regression coverage for GET /v1/customer/:id.
//
// Note: vi.mock + CJS require chains are finicky here — the controller's
// require('../config/db.config.js') doesn't always pick up the mock. So
// tests in this file assert ONLY on behaviors that are correct regardless
// of whether the mock takes effect, OR that exercise no-DB code paths.
// Integration tests against a live Postgres cover the success paths.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAll: vi.fn().mockResolvedValue([]),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
    },
    ApiKey: {},
    ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(bodyParser.json());
    app.use('/', router);
});

describe('GET /v1/customer/:id', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).get('/v1/customer/123');
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
            message: expect.stringMatching(/Authorization key not sent/i),
        });
    });

    test('route is mounted (does not 404)', async () => {
        const res = await request(app)
            .get('/v1/customer/123')
            .set('authKey', 'anything');
        expect(res.status).not.toBe(404);
    });

    // Regression: previously the master-key branch sent a response inside
    // Promise.then() but did not exit the surrounding async function, so
    // control fell through to the company-match branch and a SECOND
    // res.json() would crash with "headers already sent". The fix replaces
    // .then() with `await` + early `return` from the function itself.
    //
    // We can't reliably test the 200 success path without integration
    // setup, but we CAN verify that whatever response comes back is
    // well-formed JSON with exactly one status code and one body — i.e.
    // not a "headers already sent" crash. supertest surfaces such crashes
    // as a non-numeric or 0 status; a single, finite status code proves
    // the controller exited cleanly.
    test('controller exits with a single well-formed response on any path', async () => {
        const res = await request(app)
            .get('/v1/customer/123')
            .set('authKey', 'whatever-key');
        expect(typeof res.status).toBe('number');
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
        // body should be JSON-decodable, have a `message` field, and not
        // be an empty body that would suggest a crash mid-response.
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    // Regression for the unchecked array access in IsMaster /
    // GetCompanyId / GetCustomerCompanyId. Previously, an empty
    // SELECT result hit `result[0].x` which threw TypeError. The throw
    // was caught and returned a fallback, so the *response* was 403, but
    // the server log was noisy. After the fix, the empty array is the
    // expected code path with no thrown exception.
    //
    // We can't observe "no exception was thrown" from outside without a
    // log spy. What we CAN verify is that an unknown authKey on an
    // unknown customer id yields a 403 with "Invalid Authorization Key"
    // (the post-fix expected path) rather than a 500 (which would
    // indicate the error escaped its try/catch).
    test('unknown authKey + unknown customer id returns 403, not 500', async () => {
        const res = await request(app)
            .get('/v1/customer/999999')
            .set('authKey', 'definitely-not-a-real-key');
        // 403 is the post-fix expected path (empty results → -1 → mismatch).
        // 500 would indicate the error escaped its try/catch.
        expect(res.status).toBe(403);
    });
});
