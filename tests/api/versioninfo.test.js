// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {},
    Job: {}, Invoice: {}, CustomerPayment: {}, InvoiceJob: {}, ProductEntry: {},
    VersionInfo: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ viId: 1 }),
    },
    ApiKey: {}, ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('VersionInfo auth contract', () => {
    test('GET 403 without authKey', async () => { expect((await request(app).get('/v1/versioninfo/1')).status).toBe(403); });
    test('GET list 403 without authKey', async () => { expect((await request(app).get('/v1/versioninfo')).status).toBe(403); });
    test('POST 403 for non-master key', async () => {
        const res = await request(app)
            .post('/v1/versioninfo')
            .set('authKey', 'not-master')
            .send({ viVersion: '1.2.3', viDate: '2026-01-01T00:00:00Z' });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/master/i);
    });
    test('PATCH 403 for non-master key', async () => {
        const res = await request(app)
            .patch('/v1/versioninfo/1')
            .set('authKey', 'not-master')
            .send({ viVersion: '1.2.4' });
        expect(res.status).toBe(403);
    });
    test('DELETE 403 for non-master key', async () => {
        expect((await request(app).delete('/v1/versioninfo/1').set('authKey', 'not-master')).status).toBe(403);
    });

    test('GET 403 for unknown authKey (header present but not in DB)', async () => {
        // VersionInfo reads previously gated only on header-present, so any
        // non-empty string in `authKey` returned 200. The README's endpoint
        // table says "yes (authKey)" for reads, which the rest of the API
        // consistently means "any VALID authKey". Pin the tightening so a
        // future refactor can't accidentally drop the validation check.
        const res = await request(app).get('/v1/versioninfo/1').set('authKey', 'unknown');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Invalid Authorization Key/i);
    });
    test('GET list 403 for unknown authKey', async () => {
        const res = await request(app).get('/v1/versioninfo').set('authKey', 'unknown');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Invalid Authorization Key/i);
    });
});

describe('VersionInfo route mounting', () => {
    test('GET /v1/versioninfo/:id mounted', async () => {
        const _r = await request(app).get('/v1/versioninfo/1').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
    test('GET /v1/versioninfo mounted', async () => {
        const _r = await request(app).get('/v1/versioninfo').set('authKey', 'any');
        expect(_r.body).toBeTypeOf('object');
        expect(_r.body.message).toBeDefined();
    });
});

describe('VersionInfo body validation', () => {
    test('POST rejects unknown field', async () => {
        const res = await request(app)
            .post('/v1/versioninfo')
            .set('authKey', 'any')
            .send({ viVersion: '1.0.0', viDate: '2026-01-01T00:00:00Z', bogus: 'no' });
        expect(res.status).toBe(400);
    });
    test('POST rejects bad datetime', async () => {
        const res = await request(app)
            .post('/v1/versioninfo')
            .set('authKey', 'any')
            .send({ viVersion: '1.0.0', viDate: 'now' });
        expect(res.status).toBe(400);
    });
});
