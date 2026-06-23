// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for /v1/report/invoice-list endpoints: routing, the
// auth contract, and query validation. The scope resolution + row
// projection are unit-tested in tests/unit/report-scope.test.js.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: { Op: {} },
    Customer: {},
    Invoice: {},
    ApiKey: {},
    ApiMaster: {},
    InvoiceJob: {
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        findAll: vi.fn().mockResolvedValue([]),
    },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('/v1/report/invoice-list routing + auth', () => {
    test('GET invoice-list is mounted and 403s without authKey', async () => {
        const res = await request(app).get('/v1/report/invoice-list');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/not sent/i);
    });

    test('GET invoice-list.csv is mounted and 403s without authKey', async () => {
        const res = await request(app).get('/v1/report/invoice-list.csv');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/not sent/i);
    });

    test('unknown authKey is 403', async () => {
        const res = await request(app)
            .get('/v1/report/invoice-list')
            .set('authKey', 'unknown-key');
        expect(res.status).toBe(403);
    });
});

describe('/v1/report/invoice-list query validation', () => {
    test('rejects an unexpected query parameter', async () => {
        const res = await request(app)
            .get('/v1/report/invoice-list?bogus=1')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });

    test('rejects a non-positive customerId', async () => {
        const res = await request(app)
            .get('/v1/report/invoice-list?customerId=-1')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });
});

describe('/v1/report/aging', () => {
    test('GET aging is mounted and 403s without authKey', async () => {
        const res = await request(app).get('/v1/report/aging');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/not sent/i);
    });

    test('rejects an unexpected query parameter', async () => {
        const res = await request(app)
            .get('/v1/report/aging?bogus=1')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });

    test('rejects a malformed asOf date', async () => {
        const res = await request(app)
            .get('/v1/report/aging?asOf=not-a-date')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });
});
