// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for POST /v1/timeentry/bulk (#379) — auth + schema.
// The per-row create path is covered by the existing time-entry create
// tests (create + bulk now share createOneEntry).

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, RateSchedule: {}, Receipt: {}, ReportSchedule: {}, ApprovalChain: {}, Invitation: {}, CustomFieldDef: {}, BillableRule: {}, User: {},
    TimeEntry: { create: vi.fn(), findByPk: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }) },
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

const entry = { teCustId: 1, teStartedAt: '2026-03-01T09:00:00Z', teEndedAt: '2026-03-01T10:00:00Z' };

describe('Bulk time-entry import contract (#379)', () => {
    test('403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/timeentry/bulk').send({ entries: [entry] })).status).toBe(403);
    });
    test('400 on empty entries (schema min 1)', async () => {
        expect((await request(app).post('/v1/timeentry/bulk').set('authKey', 'k').send({ entries: [] })).status).toBe(400);
    });
    test('400 on a non-array entries (schema)', async () => {
        expect((await request(app).post('/v1/timeentry/bulk').set('authKey', 'k').send({ entries: 'nope' })).status).toBe(400);
    });
    test('400 on an unknown top-level field (strict)', async () => {
        expect((await request(app).post('/v1/timeentry/bulk').set('authKey', 'k').send({ entries: [entry], bogus: 1 })).status).toBe(400);
    });
});
