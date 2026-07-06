// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/phase (#408) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, TimeEntry: {},
    Phase: { findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

describe('Phase auth + schema contract', () => {
    test('POST /v1/phase 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/phase').send({ phaseJobId: 1, phaseName: 'Discovery' })).status).toBe(403);
    });
    test('POST /v1/phase 400 on missing phaseName (schema)', async () => {
        expect((await request(app).post('/v1/phase').set('authKey', 'k').send({ phaseJobId: 1 })).status).toBe(400);
    });
    test('POST /v1/phase 400 on inverted dates (schema refine)', async () => {
        const res = await request(app).post('/v1/phase').set('authKey', 'k')
            .send({ phaseJobId: 1, phaseName: 'X', phaseStartDate: '2026-03-01', phaseEndDate: '2026-02-01' });
        expect(res.status).toBe(400);
    });
    test('POST /v1/phase 400 on an unknown field (strict schema)', async () => {
        expect((await request(app).post('/v1/phase').set('authKey', 'k').send({ phaseJobId: 1, phaseName: 'X', bogus: 1 })).status).toBe(400);
    });
    test('GET /v1/phase/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/phase/1')).status).toBe(403);
    });
    test('GET /v1/phase/byjob/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/phase/byjob/1')).status).toBe(403);
    });
});
