// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for shareable invoice links (#438) — auth, schema,
// and the SHARE_SECRET gate.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, User: {},
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
