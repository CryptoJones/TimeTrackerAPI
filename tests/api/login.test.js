// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for user sign-in (#445) — POST /v1/login + GET /v1/me.
//
// The db mock factory must be a PURE literal (a require/hoisted ref makes
// vitest fall through to the real db.config). So the stored password hash
// is a precomputed literal: scrypt`hashPassword('rightpass99')` — the salt
// is embedded, so `verifyPassword('rightpass99', ...)` stays true.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

const RIGHT = 'rightpass99';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {},
    User: {
        findOne: vi.fn().mockResolvedValue({ userId: 1, userCompId: 5, userEmail: 'jane@co.com', userName: 'Jane', userArch: false, userPasswordHash: 'scrypt$8c920aff01e6e7e1ad165beecaa5f7c3$da3138220239821dc7c23d0218cc015a104d1668fe2e74f32b479807f22ed5a8dec765e96c98e104f816375ec8badb737a0b6f2f62b57ca9817b8f4e146e4a9c' }),
        findByPk: vi.fn().mockResolvedValue({ userId: 1, userCompId: 5, userEmail: 'jane@co.com', userName: 'Jane', userArch: false }),
    },
    ApiKey: {}, ApiMaster: {},
}));

let app;

beforeAll(async () => {
    process.env.JWT_SECRET = 'unit-test-jwt-secret';
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('POST /v1/login + GET /v1/me (#445)', () => {
    test('400 on a missing password (schema)', async () => {
        expect((await request(app).post('/v1/login').send({ userEmail: 'jane@co.com', companyId: 5 })).status).toBe(400);
    });
    test('400 on a bad email (schema)', async () => {
        expect((await request(app).post('/v1/login').send({ userEmail: 'nope', password: 'x', companyId: 5 })).status).toBe(400);
    });

    // NOTE: the happy-path (200 + JWT) and wrong-password (401) branches
    // exercise db.User.findOne, which this repo's api-test db mock cannot
    // reach (it applies to ESM importers but not the controller's CJS
    // require — every other api test only asserts pre-db 4xx). That
    // credential compose (findOne → verifyPassword → jwt.sign) is instead
    // covered by the jwt (#445) and password (#444) unit tests plus the
    // in-repo controller repro; here we cover the boundary behavior.

    test('GET /v1/me 401 without a token', async () => {
        expect((await request(app).get('/v1/me')).status).toBe(401);
    });
    test('GET /v1/me 401 with a garbage token', async () => {
        expect((await request(app).get('/v1/me').set('Authorization', 'Bearer not.a.jwt')).status).toBe(401);
    });

    test('503 when JWT_SECRET is unset', async () => {
        const saved = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        try {
            const res = await request(app).post('/v1/login').send({ userEmail: 'jane@co.com', password: RIGHT, companyId: 5 });
            expect(res.status).toBe(503);
        } finally {
            process.env.JWT_SECRET = saved;
        }
    });
});
