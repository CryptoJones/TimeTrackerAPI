// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for GET /v1/customer/bycompany/:id. This file owns the
// regression pin for issue #3 — see the `test.fails` block below.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

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

describe('GET /v1/customer/bycompany/:id', () => {
    test('route is mounted (does not 404)', async () => {
        const res = await request(app)
            .get('/v1/customer/bycompany/1')
            .set('authKey', 'anything');
        expect(res.status).not.toBe(404);
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
});
