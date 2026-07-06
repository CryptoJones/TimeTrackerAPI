// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for shareable invoice links (#438) — auth, schema,
// and the SHARE_SECRET gate.

import { describe, test, expect, vi, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, User: {},
    RevokedShareLink: {},
    ApiKey: {}, ApiMaster: {},
}));

let app;

beforeAll(async () => {
    delete process.env.SHARE_SECRET;
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('Shareable invoice links (#438)', () => {
    test('POST /:id 403 without authKey', async () => {
        expect((await request(app).post('/v1/share/invoice/1').send({})).status).toBe(403);
    });
    test('POST /:id 503 when SHARE_SECRET unset (authKey present)', async () => {
        expect((await request(app).post('/v1/share/invoice/1').set('authKey', 'k').send({})).status).toBe(503);
    });
    test('POST /:id 400 on a non-numeric id (schema)', async () => {
        expect((await request(app).post('/v1/share/invoice/abc').set('authKey', 'k').send({})).status).toBe(400);
    });
    test('GET view 400 without a token (schema)', async () => {
        expect((await request(app).get('/v1/share/invoice')).status).toBe(400);
    });
    test('GET view 503 when SHARE_SECRET unset', async () => {
        expect((await request(app).get('/v1/share/invoice?token=x.y.z')).status).toBe(503);
    });
    test('GET view 401 on a garbage token (SHARE_SECRET set)', async () => {
        process.env.SHARE_SECRET = 'unit-test-share-secret';
        try {
            expect((await request(app).get('/v1/share/invoice?token=not.a.valid.jwt')).status).toBe(401);
        } finally {
            delete process.env.SHARE_SECRET;
        }
    });
});

// Per-link revocation (#4).
describe('Share-link revocation (#4)', () => {
    const jwt = require('../../app/services/jwt.js');
    const db = require('../../app/config/db.config.js');
    const SECRET = 'unit-test-share-secret';
    afterEach(() => { delete process.env.SHARE_SECRET; });

    test('POST /v1/share/revoke 403 without authKey', async () => {
        expect((await request(app).post('/v1/share/revoke').send({ token: 'x' })).status).toBe(403);
    });
    test('POST /v1/share/revoke 503 when SHARE_SECRET unset', async () => {
        expect((await request(app).post('/v1/share/revoke').set('authKey', 'k').send({ token: 'x' })).status).toBe(503);
    });
    test('POST /v1/share/revoke 400 on a missing token (schema)', async () => {
        expect((await request(app).post('/v1/share/revoke').set('authKey', 'k').send({})).status).toBe(400);
    });
    test('POST /v1/share/revoke 400 on an invalid/expired token', async () => {
        process.env.SHARE_SECRET = SECRET;
        expect((await request(app).post('/v1/share/revoke').set('authKey', 'k').send({ token: 'not.a.jwt' })).status).toBe(400);
    });
    test('POST /v1/share/revoke 400 on a legacy token without a jti', async () => {
        process.env.SHARE_SECRET = SECRET;
        const legacy = jwt.sign({ kind: 'invoice', id: 1 }, SECRET, 3600); // no jti
        expect((await request(app).post('/v1/share/revoke').set('authKey', 'k').send({ token: legacy })).status).toBe(400);
    });

    test('GET view returns 401 when the token jti is deny-listed', async () => {
        process.env.SHARE_SECRET = SECRET;
        db.RevokedShareLink.findOne = vi.fn().mockResolvedValue({ rslId: 1 }); // revoked
        db.Invoice.findByPk = vi.fn(); // must NOT be reached
        const token = jwt.sign({ kind: 'invoice', id: 1, jti: 'deadbeef' }, SECRET, 3600);
        const res = await request(app).get(`/v1/share/invoice?token=${encodeURIComponent(token)}`);
        expect(res.status).toBe(401);
        expect(db.Invoice.findByPk).not.toHaveBeenCalled();
    });
});
