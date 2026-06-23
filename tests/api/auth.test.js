// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Schema + auth-contract tests for /v1/auth/*. The full signup→login→me
// flow (DB-touching) lives in tests/integration/auth-accounts.test.js.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' }, transaction: vi.fn() },
    Sequelize: { Op: {} },
    Customer: {}, Invoice: {}, InvoiceJob: {}, CustomerPayment: {},
    ApiKey: {}, ApiMaster: {}, User: {}, Company: {},
}));

let app;
beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('/v1/auth schema validation', () => {
    const schemas = require('../../app/schemas/auth.schema.js');

    test('signupBody requires a valid email + 8-char password', () => {
        expect(schemas.signupBody.safeParse({}).success).toBe(false);
        expect(schemas.signupBody.safeParse({ email: 'bad', password: 'longenough' }).success).toBe(false);
        expect(schemas.signupBody.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
        expect(schemas.signupBody.safeParse({ email: 'a@b.co', password: 'longenough' }).success).toBe(true);
        expect(schemas.signupBody.safeParse({ email: 'a@b.co', password: 'longenough', bogus: 1 }).success).toBe(false);
    });

    test('loginBody requires email + password', () => {
        expect(schemas.loginBody.safeParse({ email: 'a@b.co' }).success).toBe(false);
        expect(schemas.loginBody.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    });

    test('POST /v1/auth/signup 400s on a bad body', async () => {
        const res = await request(app).post('/v1/auth/signup').send({ email: 'nope' });
        expect(res.status).toBe(400);
    });

    test('POST /v1/auth/login 400s on a missing password', async () => {
        const res = await request(app).post('/v1/auth/login').send({ email: 'a@b.co' });
        expect(res.status).toBe(400);
    });
});

describe('/v1/auth auth contract', () => {
    test('POST /v1/auth/logout 403 without authKey', async () => {
        const controller = require('../../app/controllers/authcontroller.js');
        const req = { get: () => undefined };
        const r = { status(c) { this._c = c; return this; }, json(b) { this._b = b; return this; } };
        await controller.logout(req, r);
        expect(r._c).toBe(403);
    });

    test('GET /v1/auth/me 403 without authKey', async () => {
        const controller = require('../../app/controllers/authcontroller.js');
        const req = { get: () => undefined };
        const r = { status(c) { this._c = c; return this; }, json(b) { this._b = b; return this; } };
        await controller.me(req, r);
        expect(r._c).toBe(403);
    });
});
