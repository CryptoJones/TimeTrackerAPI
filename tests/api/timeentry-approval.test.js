// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for the approval endpoint (#440) — auth + schema.

import { describe, test, expect, vi, beforeAll, afterEach } from 'vitest';
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

// RBAC on the approval action for a signed-in USER (Bearer JWT): the actor
// needs the `time:approve` permission (manager+) and its own company.
describe('approval — RBAC for a JWT actor (time:approve)', () => {
    const jwt = require('../../app/services/jwt.js');
    const db = require('../../app/config/db.config.js');
    const SECRET = 'test-secret';
    const ACTOR = 100; const ENTRY = 7;

    function token() { process.env.JWT_SECRET = SECRET; return jwt.sign({ sub: ACTOR, userCompId: 1 }, SECRET, 3600); }
    function mock(actorRole, entryComp = 1, status = 'submitted') {
        db.User = { findByPk: vi.fn().mockResolvedValue({ userId: ACTOR, userCompId: 1, userRole: actorRole, userArch: false }) };
        db.TimeEntry.findByPk = vi.fn().mockResolvedValue({ teId: ENTRY, teCompId: entryComp, teArch: false, teApprovalStatus: status, update: vi.fn().mockResolvedValue(undefined) });
    }
    afterEach(() => { delete process.env.JWT_SECRET; });
    const post = () => request(app).post(`/v1/timeentry/${ENTRY}/approval`).set('authorization', `Bearer ${token()}`).send({ action: 'approve' });

    test('a manager can approve a submitted entry → 200', async () => {
        mock('manager');
        expect((await post()).status).toBe(200);
    });
    test('a member (no time:approve) → 403', async () => {
        mock('member');
        expect((await post()).status).toBe(403);
    });
    test('a cross-company entry → secure-404', async () => {
        mock('manager', 2); // entry in company 2, actor in company 1
        expect((await post()).status).toBe(404);
    });
});
