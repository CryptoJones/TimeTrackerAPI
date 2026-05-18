// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP-level smoke tests for the idempotency middleware mount.
//
// The DB is mocked out; the goal here is to verify that:
//   (a) requests WITHOUT an Idempotency-Key header pass through
//       cleanly — the middleware must not break legacy clients.
//   (b) requests WITH a malformed Idempotency-Key are rejected with
//       400 before any handler runs.
//   (c) the middleware is only applied to POSTs — GET should never
//       hit the rejection path even if the header is present.
//
// Full first-write-then-replay coverage requires a real DB and lives
// in the integration suite (gated behind P5-M).

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

// Stub the DB so the middleware's `db.sequelize.query` path doesn't
// blow up on an unreachable Postgres. With no `.query` Function we
// would hit the "no sequelize handle" early-out; we provide one that
// resolves to no rows so the lookup branch decides "not cached" and
// we continue to the handler.
vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
    Customer: {
        create: vi.fn().mockResolvedValue({ custId: 1 }),
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

describe('Idempotency middleware: mounted on POST routes', () => {
    test('POST without Idempotency-Key passes through unchanged', async () => {
        // No header, no special handling. Whatever the controller
        // returns (400/403/etc — depends on the inline auth check)
        // is fine; the idempotency layer must not insert itself.
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'any')
            .send({ custCompanyName: 'Test' });
        expect(res.status).not.toBe(409);
        // The middleware-injected reject path has a specific code;
        // confirm it's not present.
        expect(res.body && res.body.code).not.toBe('idempotency_key_reused');
    });

    test('POST with whitespace in Idempotency-Key returns 400', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'any')
            .set('Idempotency-Key', 'has space')
            .send({});
        expect(res.status).toBe(400);
    });

    test('POST with a valid Idempotency-Key reaches the handler (no cache hit on empty mock)', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'any')
            .set('Idempotency-Key', '01HFTESTKEY12345')
            .send({ custCompanyName: 'Acme' });
        // Whatever the controller decides (likely 403 from inline
        // auth, since the mock returns []), the idempotency layer
        // should NOT have short-circuited with 400/409. That's the
        // signal the middleware ran and decided "no cache hit".
        expect(res.status).not.toBe(400);
        expect(res.status).not.toBe(409);
    });

    test('GET requests are never gated by the middleware', async () => {
        // Even with a malformed header, a GET should sail through —
        // the middleware is wrapped in a method check that no-ops
        // for non-POST. This is the regression pin: we never want
        // to break a legacy GET because someone forgot to strip
        // the header on a non-POST retry.
        const res = await request(app)
            .get('/v1/customer/bycompany/1?limit=1')
            .set('authKey', 'any')
            .set('Idempotency-Key', '');
        expect(res.status).not.toBe(400);
    });
});
