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
            // Full required-field body so the schema validator passes
            // and we exercise the idempotency middleware itself rather
            // than short-circuiting on a 400 from zod.
            .send({ custCompanyName: 'Acme', custFName: 'Test', custLName: 'User' });
        // Whatever the controller decides (likely 403 from inline
        // auth, since the mock returns []), the idempotency layer
        // should NOT have short-circuited with 400/409. That's the
        // signal the middleware ran and decided "no cache hit".
        expect(res.status).not.toBe(400);
        expect(res.status).not.toBe(409);
    });

    // A stateful in-memory stand-in for the IdempotencyKey table that models
    // the pre-handler CLAIM protocol (audit item #2): INSERT claims a pending
    // slot (or re-claims an expired one), UPDATE completes it, DELETE releases
    // or prunes. All mutations are synchronous so a sequential retry in a test
    // deterministically sees the completed row (mirrors: the completion UPDATE
    // is issued before the first response's bytes flush).
    function makeClaimStub() {
        const store = new Map();
        const kf = (r) => `${r.scope}::${r.key}`;
        return {
            store,
            sequelize: {
                query: vi.fn(async (sql, opts) => {
                    const r = (opts && opts.replacements) || {};
                    if (/^INSERT/.test(sql)) {
                        const k = kf(r);
                        const cur = store.get(k);
                        const pendMs = r.pendingExpiry && r.pendingExpiry.getTime
                            ? r.pendingExpiry.getTime() : Date.now() + 300000;
                        if (!cur || cur.expiresAt < Date.now()) {
                            store.set(k, { requestHash: r.requestHash, status: null, body: null, expiresAt: pendMs });
                            return [[{ ikId: 1 }]];  // claimed
                        }
                        return [[]];  // conflict — a live row already holds it
                    }
                    if (/^SELECT/.test(sql)) {
                        const cur = store.get(kf(r));
                        return cur && cur.expiresAt >= Date.now() ? [cur] : [];
                    }
                    if (/^UPDATE/.test(sql)) {
                        const cur = store.get(kf(r));
                        if (cur) {
                            cur.status = r.status;
                            cur.body = JSON.parse(r.body);
                            cur.expiresAt = r.expiresAt && r.expiresAt.getTime ? r.expiresAt.getTime() : Date.now() + 86400000;
                        }
                        return [[], {}];
                    }
                    if (/^DELETE/.test(sql)) {
                        if (/ikResponseStatus" IS NULL/.test(sql)) {          // release
                            const cur = store.get(kf(r));
                            if (cur && cur.status == null) store.delete(kf(r));
                        } else {                                              // prune expired
                            for (const [k, v] of store) if (v.expiresAt < Date.now()) store.delete(k);
                        }
                        return [[], {}];
                    }
                    return [[], {}];
                }),
            },
            Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
        };
    }

    test('first write + replay round-trip works via the _setDbForTesting seam', async () => {
        // Walk the full claim → complete → replay path that vi.mock alone
        // can't reach, driven by the stateful claim stub.
        const idem = require('../../app/middleware/idempotency.js');
        const stub = makeClaimStub();
        idem._setDbForTesting(stub);
        try {
            const key = '01HFREPLAY12345';
            const body = { custCompanyName: 'Acme' };
            // First request: cache miss → controller runs → response stored.
            const first = await request(app)
                .post('/v1/customer')
                .set('authKey', 'any')
                .set('Idempotency-Key', key)
                .send(body);
            // Whatever the controller decided (403/500 with the
            // broken-DB env). We DON'T care about the underlying
            // status, only that the response was cached.
            expect(first.headers['idempotency-replay']).toBeUndefined();

            // Second request: same key + same body. Should be a replay.
            const second = await request(app)
                .post('/v1/customer')
                .set('authKey', 'any')
                .set('Idempotency-Key', key)
                .send(body);
            expect(second.headers['idempotency-replay']).toBe('true');
            expect(second.status).toBe(first.status);
            expect(second.body).toEqual(first.body);

            // Third request: same key, DIFFERENT body → 409 conflict.
            const third = await request(app)
                .post('/v1/customer')
                .set('authKey', 'any')
                .set('Idempotency-Key', key)
                .send({ custCompanyName: 'Different' });
            expect(third.status).toBe(409);
            expect(third.body.code).toBe('idempotency_key_reused');
        } finally {
            idem._setDbForTesting(null);
        }
    });

    test('a concurrent in-flight request (same key+body, still pending) → 409 in_progress', async () => {
        // This is the double-execution guard (audit item #2): while one
        // request holds a PENDING claim, a second with the SAME key+body must
        // NOT run the handler — it gets 409 in_progress. We simulate the
        // in-flight holder with a stub whose claim always conflicts and whose
        // lookup returns a pending row carrying the matching request hash.
        const idem = require('../../app/middleware/idempotency.js');
        const body = { custCompanyName: 'Acme' };
        const bodyHash = idem.hashBody(body);
        const stub = {
            sequelize: {
                query: vi.fn(async (sql) => {
                    if (/^INSERT/.test(sql)) return [[]];                          // claim lost — a live row exists
                    if (/^SELECT/.test(sql)) return [{ requestHash: bodyHash, status: null, body: null }]; // pending
                    return [[], {}];
                }),
            },
            Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
        };
        idem._setDbForTesting(stub);
        try {
            const res = await request(app)
                .post('/v1/customer')
                .set('authKey', 'any')
                .set('Idempotency-Key', '01HFINFLIGHT999')
                .send(body);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('idempotency_in_progress');
        } finally {
            idem._setDbForTesting(null);
        }
    });

    test('a pending claim past PENDING_TTL is re-claimable (a stuck holder does not block forever)', async () => {
        // Seed an EXPIRED pending row; the next request must win the claim
        // (the INSERT…ON CONFLICT DO UPDATE WHERE expiresAt < now() path) and
        // reach the handler rather than 409.
        const idem = require('../../app/middleware/idempotency.js');
        const stub = makeClaimStub();
        // Pre-seed an expired pending row for whatever (scope,key) the request
        // computes — easier to force via the stub: first INSERT sees the
        // expired row and re-claims. We emulate "expired" by seeding with a
        // past expiry keyed to the first INSERT's replacements.
        let seeded = false;
        const realQuery = stub.sequelize.query;
        stub.sequelize.query = vi.fn(async (sql, opts) => {
            if (/^INSERT/.test(sql) && !seeded) {
                seeded = true;
                const r = opts.replacements;
                stub.store.set(`${r.scope}::${r.key}`, { requestHash: 'stale', status: null, body: null, expiresAt: Date.now() - 1000 });
            }
            return realQuery(sql, opts);
        });
        idem._setDbForTesting(stub);
        try {
            const res = await request(app)
                .post('/v1/customer')
                .set('authKey', 'any')
                .set('Idempotency-Key', '01HFSTUCK0001')
                .send({ custCompanyName: 'Acme' });
            // Re-claimed + ran the handler → NOT a 409 in_progress / reused.
            expect(res.status).not.toBe(409);
            expect(res.headers['idempotency-replay']).toBeUndefined();
        } finally {
            idem._setDbForTesting(null);
        }
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


describe('Idempotency middleware: bounded canonicalJson (DoS defense)', () => {
    test('deeply nested body returns 400 — NOT 500', async () => {
        // Construct a 5000-deep payload AS A RAW STRING. JSON.stringify
        // itself recurses and overflows on deeply nested objects, so
        // .send(nestedObject) can't even build the payload — supertest
        // would throw client-side. Build the JSON text iteratively
        // instead; express.json() parses iteratively (V8 ≥9) so the
        // body still reaches req.body intact.
        const depth = 5000;
        let payload = '0';
        for (let i = 0; i < depth; i++) payload = '{"a":' + payload + '}';

        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'any')
            .set('Idempotency-Key', 'depth-test-001')
            .set('Content-Type', 'application/json')
            .send(payload);

        // Pre-fix: 500 (RangeError from canonicalJson surfacing via
        // the global error handler). Post-fix: 400. The specific 400
        // body has code:'body_too_deep'; we don't insist on that exact
        // shape (Express' own parser or a future express.json depth
        // guard could also emit a different 400 body), only that
        // we no longer 500.
        expect(res.status).not.toBe(500);
        expect(res.status).toBe(400);
        if (res.body && res.body.code === 'body_too_deep') {
            expect(res.body.message).toMatch(/nesting depth/i);
        }
    });

    test('shallow body with Idempotency-Key still proceeds normally', async () => {
        // Positive control: a normal body (any depth below the cap)
        // does not 400. Whatever status the controller returns
        // (likely 403 because of the empty ApiKey mock) is fine —
        // we just want to prove the depth check didn't trip.
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'any')
            .set('Idempotency-Key', 'shallow-test-001')
            .send({
                custCompanyName: 'Acme',
                custFName: 'Test',
                custLName: 'User',
            });
        expect(res.status).not.toBe(400);
        // Don't assert on body.code — the controller emits whatever
        // it emits; we only care the depth check stayed silent.
        expect(res.body && res.body.code).not.toBe('body_too_deep');
    });
});
