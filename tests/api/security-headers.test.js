// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies helmet is wired and the expected security headers are
// emitted on responses.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
// body-parser dropped; express has it built-in since 4.16
import helmet from 'helmet';

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
    // Build an app that matches server.js's middleware stack: helmet
    // FIRST, then router. We don't import server.js itself because it
    // calls app.listen() at module load.
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));
    app.use(express.json());
    app.use('/', router);
});

describe('security headers (helmet)', () => {
    test('X-Content-Type-Options is set to nosniff', async () => {
        const res = await request(app).get('/healthz');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    test('X-Frame-Options is set (SAMEORIGIN or DENY)', async () => {
        const res = await request(app).get('/healthz');
        expect(res.headers['x-frame-options']).toMatch(/^(SAMEORIGIN|DENY)$/);
    });

    test('Strict-Transport-Security is set with a max-age', async () => {
        const res = await request(app).get('/healthz');
        // helmet sets HSTS even on plain HTTP (clients ignore it; orchestrators
        // and security scanners check that it's at least present).
        expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    });

    test('X-Powered-By header is removed', async () => {
        const res = await request(app).get('/healthz');
        // helmet strips X-Powered-By by default — small but real
        // info-disclosure mitigation.
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    test('Referrer-Policy is set', async () => {
        const res = await request(app).get('/healthz');
        expect(res.headers['referrer-policy']).toBeDefined();
    });

    test('headers are applied on customer endpoint too (not just healthz)', async () => {
        const res = await request(app).get('/v1/customer/123');
        // Whatever the status (likely 403 without authKey), the helmet
        // headers should still be present.
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toMatch(/^(SAMEORIGIN|DENY)$/);
    });
});
