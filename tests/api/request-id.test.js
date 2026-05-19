// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies the X-Request-Id propagation: incoming value is honored
// when valid, a fresh UUID is generated otherwise.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import pinoHttp from 'pino-http';
import crypto from 'crypto';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: { findByPk: vi.fn(), findAll: vi.fn().mockResolvedValue([]), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }) },
    ApiKey: {}, ApiMaster: {},
    TimeEntry: { findByPk: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    const log = (await import('../../app/config/logger.js')).default;
    app = express();
    app.use(pinoHttp({
        logger: log,
        genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const valid = typeof incoming === 'string'
                && incoming.length > 0
                && incoming.length <= 128
                && /^[\x21-\x7e]+$/.test(incoming);
            const reqId = valid ? incoming : crypto.randomUUID();
            res.setHeader('X-Request-Id', reqId);
            return reqId;
        },
    }));
    app.use(express.json());
    app.use('/', router);
});

describe('X-Request-Id', () => {
    test('is generated when not provided by the client', async () => {
        const res = await request(app).get('/healthz');
        const id = res.headers['x-request-id'];
        expect(id).toBeDefined();
        // UUID v4 shape
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('is honored when provided by the client and within size limits', async () => {
        const incoming = 'caller-supplied-trace-id-12345';
        const res = await request(app)
            .get('/healthz')
            .set('X-Request-Id', incoming);
        expect(res.headers['x-request-id']).toBe(incoming);
    });

    test('replaces an oversized incoming value with a generated UUID', async () => {
        const oversized = 'x'.repeat(200);
        const res = await request(app)
            .get('/healthz')
            .set('X-Request-Id', oversized);
        const id = res.headers['x-request-id'];
        expect(id).not.toBe(oversized);
        expect(id).toMatch(/^[0-9a-f-]+$/i);
    });

    test('each request gets a unique id when none supplied', async () => {
        const r1 = await request(app).get('/healthz');
        const r2 = await request(app).get('/healthz');
        expect(r1.headers['x-request-id']).not.toBe(r2.headers['x-request-id']);
    });

    test('replaces an incoming value with whitespace with a generated UUID', async () => {
        // Embedded space (0x20) is outside the printable-ASCII range
        // [0x21..0x7e] we accept. Without the charset guard, this
        // value would land in `res.setHeader('X-Request-Id', ...)`
        // — Node accepts spaces in header values fine, but the
        // looser check is also a foothold for CR/LF injection
        // through proxies that don't sanitize. Treat anything
        // outside the printable-no-space range as invalid.
        const res = await request(app)
            .get('/healthz')
            .set('X-Request-Id', 'has spaces');
        const id = res.headers['x-request-id'];
        expect(id).not.toBe('has spaces');
        expect(id).toMatch(/^[0-9a-f-]+$/i);
    });

    test('replaces an incoming value with a tab character with a generated UUID', async () => {
        // Tabs (0x09) are outside the printable-ASCII range and would
        // be smuggled through some intermediate proxies as a header
        // continuation. Treat them as invalid like the whitespace case
        // above. Supertest accepts the byte (unlike NUL or CR/LF
        // which it rejects pre-flight) so we can drive the path
        // end-to-end here.
        const res = await request(app)
            .get('/healthz')
            .set('X-Request-Id', 'has\ttab');
        const id = res.headers['x-request-id'];
        expect(id).not.toBe('has\ttab');
        expect(id).toMatch(/^[0-9a-f-]+$/i);
    });
});
