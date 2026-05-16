// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for GET /healthz.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

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
    app.use('/', router);
});

describe('GET /healthz', () => {
    test('route is mounted (does not 404)', async () => {
        const res = await request(app).get('/healthz');
        expect(res.status).not.toBe(404);
    });

    test('returns JSON with expected shape', async () => {
        const res = await request(app).get('/healthz');
        // Regardless of whether the mock applies (CJS finickiness), the
        // controller always returns 200 or 503 with a JSON body with
        // {status, db, uptime_s, version} keys.
        expect([200, 503]).toContain(res.status);
        expect(res.body).toBeTypeOf('object');
        expect(['ok', 'degraded']).toContain(res.body.status);
        expect(['ok', 'down']).toContain(res.body.db);
        expect(typeof res.body.uptime_s).toBe('number');
        expect(res.body.uptime_s).toBeGreaterThanOrEqual(0);
        expect(typeof res.body.version).toBe('string');
        expect(typeof res.body.elapsed_ms).toBe('number');
    });

    test('does not require authKey header', async () => {
        const res = await request(app).get('/healthz');
        // Should never be 403 — health probes are unauthenticated by design.
        expect(res.status).not.toBe(403);
    });

    test('status and db fields agree (both ok or both not-ok)', async () => {
        const res = await request(app).get('/healthz');
        if (res.body.status === 'ok') {
            expect(res.body.db).toBe('ok');
            expect(res.status).toBe(200);
        } else {
            expect(res.body.db).toBe('down');
            expect(res.status).toBe(503);
        }
    });
});
