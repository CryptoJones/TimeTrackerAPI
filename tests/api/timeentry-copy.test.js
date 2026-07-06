// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for the copy-previous endpoint (#399) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {},
    TimeEntry: { findByPk: vi.fn().mockResolvedValue(null), create: vi.fn() },
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

describe('Copy-previous time entry contract', () => {
    test('POST /v1/timeentry/:id/copy 403 without authKey (empty body ok)', async () => {
        expect((await request(app).post('/v1/timeentry/1/copy').send({})).status).toBe(403);
    });
    test('POST /v1/timeentry/:id/copy 400 on a non-datetime teStartedAt (schema)', async () => {
        const res = await request(app).post('/v1/timeentry/1/copy').set('authKey', 'k').send({ teStartedAt: 'yesterday' });
        expect(res.status).toBe(400);
    });
    test('POST /v1/timeentry/:id/copy 400 on an inverted range (schema refine)', async () => {
        const res = await request(app).post('/v1/timeentry/1/copy').set('authKey', 'k')
            .send({ teStartedAt: '2026-07-02T10:00:00Z', teEndedAt: '2026-07-02T09:00:00Z' });
        expect(res.status).toBe(400);
    });
    test('POST /v1/timeentry/:id/copy 400 on an unknown field (strict)', async () => {
        expect((await request(app).post('/v1/timeentry/1/copy').set('authKey', 'k').send({ bogus: 1 })).status).toBe(400);
    });
});
