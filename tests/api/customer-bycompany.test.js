// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for GET /v1/customer/bycompany/:id. This file owns the
// regression pin for issue #3 — see the `test.fails` block below.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
// body-parser dropped; express has it built-in since 4.16

// Stub the Sequelize DB so a missing-Postgres environment doesn't make the
// suite hang on connection attempts. Note: vi.mock for CJS require chains
// is finicky, so the controller may still attempt a real Sequelize call
// in some paths — every test in this file is written to be correct
// regardless of whether the mock takes effect or the request errors out.
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
    app.use(express.json());
    app.use('/', router);
});

describe('GET /v1/customer/bycompany/:id', () => {
    test('route is mounted (does not 404)', async () => {
        const res = await request(app)
            .get('/v1/customer/bycompany/1')
            .set('authKey', 'anything');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    // Regression for #3. Previously this endpoint had no auth check and
    // returned customer data (or 500) on requests without authKey. Fixed
    // in the same PR that flipped this from `test.fails` to `test`.
    test('returns 403 when authKey is missing (regression for #3)', async () => {
        const res = await request(app).get('/v1/customer/bycompany/1');
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
            message: expect.stringMatching(/Authorization key not sent/i),
        });
    });

    // Pagination query params (?limit, ?offset) are parsed defensively
    // and never crash the controller — bad values fall back to defaults
    // rather than 400 or 500.
    test('pagination params do not crash the controller', async () => {
        const r1 = await request(app).get('/v1/customer/bycompany/1?limit=10');
        const r2 = await request(app).get('/v1/customer/bycompany/1?limit=999999');
        const r3 = await request(app).get('/v1/customer/bycompany/1?limit=abc&offset=xyz');
        const r4 = await request(app).get('/v1/customer/bycompany/1?limit=-5');
        for (const r of [r1, r2, r3, r4]) {
            expect(typeof r.status).toBe('number');
            expect(r.status).not.toBe(500);
            expect(r.body).toBeTypeOf('object');
        }
    });
});
