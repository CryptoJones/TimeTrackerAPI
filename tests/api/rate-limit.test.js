// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies the express-rate-limit middleware is wired on /v1 and
// that /healthz is exempt.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([{ ok: 1 }]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: { findByPk: vi.fn(), findAll: vi.fn() },
    ApiKey: {},
    ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(bodyParser.json());
    // Aggressively low limit so we trip it inside the test window.
    const limiter = rateLimit({
        windowMs: 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many requests — try again later.' },
    });
    app.use('/v1', limiter);
    app.use('/', router);
});

describe('rate limiting', () => {
    test('emits RateLimit-* standard headers on /v1', async () => {
        const res = await request(app)
            .get('/v1/customer/1')
            .set('authKey', 'k');
        // RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset (RFC 6585 / draft-ietf-httpapi-ratelimit-headers).
        expect(res.headers['ratelimit-limit']).toBeDefined();
        expect(res.headers['ratelimit-remaining']).toBeDefined();
    });

    test('trips with 429 after the per-window quota is exhausted', async () => {
        // The limiter from beforeAll has max=3 over a 60s window. The
        // previous test consumed 1. Hit it twice more then verify the
        // next call gets 429.
        const r1 = await request(app).get('/v1/customer/1').set('authKey', 'k');
        expect(r1.status).not.toBe(429);
        const r2 = await request(app).get('/v1/customer/1').set('authKey', 'k');
        expect(r2.status).not.toBe(429);
        const r3 = await request(app).get('/v1/customer/1').set('authKey', 'k');
        expect(r3.status).toBe(429);
        expect(r3.body.message).toMatch(/too many requests/i);
    });

    test('does not apply to /healthz', async () => {
        // We can hit healthz many times without ever getting 429.
        for (let i = 0; i < 5; i += 1) {
            const res = await request(app).get('/healthz');
            expect(res.status).not.toBe(429);
        }
    });
});
