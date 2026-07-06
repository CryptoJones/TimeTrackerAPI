// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for the approval endpoint (#440) — auth + schema.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {},
    TimeEntry: { findByPk: vi.fn().mockResolvedValue(null) },
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

describe('Timesheet approval contract', () => {
    test('POST /v1/timeentry/:id/approval 403 without authKey (valid body)', async () => {
        expect((await request(app).post('/v1/timeentry/1/approval').send({ action: 'submit' })).status).toBe(403);
    });
    test('POST /v1/timeentry/:id/approval 400 on an invalid action (schema)', async () => {
        expect((await request(app).post('/v1/timeentry/1/approval').set('authKey', 'k').send({ action: 'lgtm' })).status).toBe(400);
    });
    test('POST /v1/timeentry/:id/approval 400 on a missing action (schema)', async () => {
        expect((await request(app).post('/v1/timeentry/1/approval').set('authKey', 'k').send({})).status).toBe(400);
    });
});
