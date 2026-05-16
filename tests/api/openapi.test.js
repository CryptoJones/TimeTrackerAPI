// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for the OpenAPI spec + Swagger UI mount.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {
        findByPk: vi.fn(), findAll: vi.fn().mockResolvedValue([]),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn(),
    },
    ApiKey: {}, ApiMaster: {},
    TimeEntry: { findByPk: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(bodyParser.json());
    app.use('/', router);
});

describe('OpenAPI spec', () => {
    test('GET /openapi.json returns the spec', async () => {
        const res = await request(app).get('/openapi.json');
        expect(res.status).toBe(200);
        expect(res.body.openapi).toMatch(/^3\./);
        expect(res.body.info.title).toBe('TimeTrackerAPI');
        expect(res.body.info.version).toBeDefined();
    });

    test('spec includes all v1 paths', async () => {
        const res = await request(app).get('/openapi.json');
        const paths = Object.keys(res.body.paths);
        expect(paths).toContain('/healthz');
        expect(paths).toContain('/v1/customer/{id}');
        expect(paths).toContain('/v1/customer/bycompany/{id}');
        expect(paths).toContain('/v1/customer');
        expect(paths).toContain('/v1/timeentry');
        expect(paths).toContain('/v1/timeentry/{id}');
        expect(paths).toContain('/v1/timeentry/bycompany/{id}');
    });

    test('spec declares the authKey security scheme', async () => {
        const res = await request(app).get('/openapi.json');
        const schemes = res.body.components.securitySchemes;
        expect(schemes.authKey).toBeDefined();
        expect(schemes.authKey.type).toBe('apiKey');
        expect(schemes.authKey.in).toBe('header');
        expect(schemes.authKey.name).toBe('authKey');
    });

    test('Customer and TimeEntry schemas are exported', async () => {
        const res = await request(app).get('/openapi.json');
        const schemas = res.body.components.schemas;
        expect(schemas.Customer).toBeDefined();
        expect(schemas.TimeEntry).toBeDefined();
        // Field spot check
        expect(schemas.Customer.properties.custId).toBeDefined();
        expect(schemas.TimeEntry.properties.teStartedAt).toBeDefined();
    });

    test('GET /docs serves Swagger UI HTML', async () => {
        const res = await request(app).get('/docs/');
        // swagger-ui-express serves HTML; we don't pin the exact body
        // (it changes per swagger-ui release) but the content-type
        // must be HTML and the title must be present.
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('Swagger');
    });
});
