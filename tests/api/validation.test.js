// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Tests for zod-backed request validation. Confirms that obviously
// malformed inputs hit 400 with a structured error before reaching
// the controller / DB.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
// body-parser dropped; express has it built-in since 4.16

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAll: vi.fn().mockResolvedValue([]),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ custId: 1 }),
    },
    ApiKey: {}, ApiMaster: {},
    TimeEntry: { findByPk: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('path param validation', () => {
    test('non-integer customer id returns 400 with issues array', async () => {
        const res = await request(app)
            .get('/v1/customer/not-a-number')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/validation/i);
        expect(Array.isArray(res.body.issues)).toBe(true);
        expect(res.body.issues.length).toBeGreaterThan(0);
    });

    test('zero customer id returns 400 (positive int required)', async () => {
        const res = await request(app)
            .get('/v1/customer/0')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });

    test('negative time-entry id returns 400', async () => {
        const res = await request(app)
            .get('/v1/timeentry/-1')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });
});

describe('body validation — POST /v1/customer', () => {
    test('unexpected field is rejected (strict whitelist)', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'whatever')
            .send({ custFName: 'A', sneaky: 'forged-value' });
        expect(res.status).toBe(400);
        // The validator should flag the offending field by name
        const text = JSON.stringify(res.body);
        expect(text).toMatch(/sneaky|whitelist/i);
    });

    test('bad email format is rejected', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'whatever')
            .send({ custEmail: 'not an email' });
        expect(res.status).toBe(400);
        const text = JSON.stringify(res.body);
        expect(text).toMatch(/email/i);
    });

    test('valid body passes validation (no body issues)', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'unknown-key')  // will still 403 at controller
            .send({ custCompanyName: 'Acme', custCompId: 1 });
        // After zod passes, the controller's auth check 403s on the
        // unknown key — that's the expected post-validation path.
        // We just need to confirm we got past the 400 validator.
        expect(res.status).not.toBe(400);
    });
});

describe('body validation — POST /v1/timeentry', () => {
    test('missing teCustId is rejected', async () => {
        const res = await request(app)
            .post('/v1/timeentry')
            .set('authKey', 'whatever')
            .send({ teStartedAt: '2026-05-16T09:00:00Z' });
        expect(res.status).toBe(400);
    });

    test('missing teStartedAt is rejected', async () => {
        const res = await request(app)
            .post('/v1/timeentry')
            .set('authKey', 'whatever')
            .send({ teCustId: 1 });
        expect(res.status).toBe(400);
    });

    test('non-ISO teStartedAt is rejected', async () => {
        const res = await request(app)
            .post('/v1/timeentry')
            .set('authKey', 'whatever')
            .send({ teCustId: 1, teStartedAt: 'yesterday' });
        expect(res.status).toBe(400);
        const text = JSON.stringify(res.body);
        expect(text).toMatch(/iso/i);
    });

    test('unexpected field is rejected (strict whitelist)', async () => {
        const res = await request(app)
            .post('/v1/timeentry')
            .set('authKey', 'whatever')
            .send({
                teCustId: 1,
                teStartedAt: '2026-05-16T09:00:00Z',
                teMinutes: 9999,  // server-managed, should not be settable
            });
        expect(res.status).toBe(400);
    });

    test('teId in body is rejected (server-managed)', async () => {
        const res = await request(app)
            .post('/v1/timeentry')
            .set('authKey', 'whatever')
            .send({
                teCustId: 1,
                teStartedAt: '2026-05-16T09:00:00Z',
                teId: 999,  // forged-id attempt
            });
        expect(res.status).toBe(400);
    });
});

describe('query param validation — GET /v1/timeentry/bycompany/:id', () => {
    test('unexpected query param is rejected', async () => {
        const res = await request(app)
            .get('/v1/timeentry/bycompany/1?sneaky=value')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });

    test('bad from-date is rejected', async () => {
        const res = await request(app)
            .get('/v1/timeentry/bycompany/1?from=yesterday')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });

    test('valid query passes validation', async () => {
        const res = await request(app)
            .get('/v1/timeentry/bycompany/1?limit=10&from=2026-05-01T00:00:00Z')
            .set('authKey', 'unknown-key');
        // Post-validation, controller will 403 the unknown key.
        expect(res.status).not.toBe(400);
    });
});
