// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for GET /v1/customer/:id.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

// Mock the Sequelize db module so the controller's imports resolve without
// needing a live Postgres. Default behavior: queries return empty, model
// lookups return null. Each test can override per call as needed.
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
    // The mock is hoisted by vitest, so the controller picks it up at
    // require time.
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
        // We're not asserting 200 here — without a real DB the response
        // shape depends on the mock — only that the route exists and is
        // wired through the router.
        expect(res.status).not.toBe(404);
    });
});
