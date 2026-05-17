// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies the express.json() body-size limit kicks in for oversized
// payloads (returns 413 PayloadTooLarge).

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: { findByPk: vi.fn(), findAll: vi.fn().mockResolvedValue([]), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
    ApiKey: {}, ApiMaster: {},
    TimeEntry: { findByPk: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    // Use a tiny 1kb limit so we can trip it without sending megabytes.
    app = express();
    app.use(express.json({ limit: '1kb' }));
    app.use('/', router);
});

describe('body size limit', () => {
    test('oversized JSON body returns 413', async () => {
        // Build a body > 1kb. zod schema would reject the unknown field
        // anyway, but express.json() trips first because it parses the
        // body before any downstream middleware runs.
        const payload = { custCompanyName: 'x'.repeat(2000) };
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'whatever')
            .send(payload);
        expect(res.status).toBe(413);
    });

    test('small JSON body passes the size check', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'whatever')
            .send({ custCompanyName: 'Acme', custCompId: 1 });
        // We hit validation / auth downstream; just verify the body
        // parser didn't reject for size.
        expect(res.status).not.toBe(413);
    });
});
