// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for POST /v1/customer.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAll: vi.fn().mockResolvedValue([]),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn().mockResolvedValue({ custId: 1 }),
    },
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

describe('POST /v1/customer', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .send({ custCompanyName: 'Acme' });
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
            message: expect.stringMatching(/Authorization key not sent/i),
        });
    });

    test('route is mounted as POST (not 404, not 405)', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'anything')
            .send({});
        expect(res.status).not.toBe(404);
        expect(res.status).not.toBe(405);
    });

    test('unknown authKey returns 403 (invalid auth)', async () => {
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'definitely-not-a-real-key')
            .send({ custCompanyName: 'Acme', custCompId: 1 });
        // With no DB, IsMaster returns false, GetCompanyId returns -1,
        // and the controller emits 403 "Invalid Authorization Key."
        expect(res.status).toBe(403);
    });

    test('returns 415-equivalent (400/403) for body without required fields', async () => {
        // Without a valid authKey + DB, this short-circuits to 403 before
        // body validation. Verify the controller doesn't crash on an empty
        // body or non-JSON content.
        const res = await request(app)
            .post('/v1/customer')
            .set('authKey', 'whatever-key');
        expect([400, 403]).toContain(res.status);
        expect(res.body.message).toBeDefined();
    });
});
