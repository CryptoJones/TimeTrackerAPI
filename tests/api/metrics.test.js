// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for the /metrics scrape endpoint (P4-J).

import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {},
    InventoryItem: {}, Company: {}, Job: {}, Invoice: {},
    CustomerPayment: {}, InvoiceJob: {}, ProductEntry: {},
    VersionInfo: {}, PurchaseOrderVendor: {}, PurchaseOrderHeader: {},
    PurchaseOrderLine: {}, InventoryTransaction: {},
    ApiKey: {}, ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    const { metricsMiddleware } = await import('../../app/middleware/metrics.js');
    app = express();
    app.use(express.json());
    app.use(metricsMiddleware);
    app.use('/', router);
});

describe('GET /metrics', () => {
    test('route is mounted (not 404)', async () => {
        const res = await request(app).get('/metrics');
        expect(res.status).not.toBe(404);
    });

    test('returns Prometheus text-format on a default scrape', async () => {
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(200);
        // prom-client sets `text/plain; version=0.0.4; charset=utf-8`.
        expect(res.headers['content-type']).toMatch(/text\/plain/);
        // Should include at least one default Node.js metric line.
        expect(res.text).toMatch(/^# HELP/m);
        expect(res.text).toMatch(/^# TYPE/m);
        expect(res.text).toMatch(/process_cpu_user_seconds_total|nodejs_/);
    });

    test('the http_* metrics are registered (visible in scrape output)', async () => {
        // Fire a couple of upstream requests to give the middleware
        // a chance to record samples — though vi.mock + nested CJS
        // requires (P5-M) sometimes interpose between the middleware
        // and the registered counter. The hard requirement we pin
        // here is just that the metrics ARE registered, so a future
        // refactor that drops the declaration shows up as a failure.
        await request(app).get('/healthz');
        await request(app).get('/v1/whoami').set('authKey', 'any');
        const res = await request(app).get('/metrics');
        expect(res.text).toContain('http_requests_total');
        expect(res.text).toContain('http_request_duration_seconds');
        expect(res.text).toMatch(/# TYPE http_requests_total counter/);
        expect(res.text).toMatch(/# TYPE http_request_duration_seconds histogram/);
    });

    test('does not require authKey header (orthogonal to API auth)', async () => {
        const res = await request(app).get('/metrics');
        expect(res.status).not.toBe(403);
    });
});

describe('GET /metrics — METRICS_BEARER_TOKEN gate', () => {
    const ORIGINAL = process.env.METRICS_BEARER_TOKEN;

    beforeEach(() => {
        process.env.METRICS_BEARER_TOKEN = 'secret-test-token';
    });
    afterEach(() => {
        if (ORIGINAL === undefined) delete process.env.METRICS_BEARER_TOKEN;
        else process.env.METRICS_BEARER_TOKEN = ORIGINAL;
    });

    test('401 when the env var is set but no Authorization header is supplied', async () => {
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(401);
    });

    test('401 when the Authorization header carries the wrong token', async () => {
        const res = await request(app)
            .get('/metrics')
            .set('Authorization', 'Bearer not-the-token');
        expect(res.status).toBe(401);
    });

    test('200 when the Authorization header carries the right token', async () => {
        const res = await request(app)
            .get('/metrics')
            .set('Authorization', 'Bearer secret-test-token');
        expect(res.status).toBe(200);
    });
});
