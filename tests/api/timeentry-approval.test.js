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
    // workerUserId = the User the entry's worker is linked to (defaults to a
    // DIFFERENT user, so it's not self-approval unless overridden to ACTOR).
    function mock(actorRole, entryComp = 1, status = 'submitted', workerUserId = 999) {
        db.User = { findByPk: vi.fn().mockResolvedValue({ userId: ACTOR, userCompId: 1, userRole: actorRole, userArch: false }) };
        db.TimeEntry.findByPk = vi.fn().mockResolvedValue({ teId: ENTRY, teCompId: entryComp, teArch: false, teApprovalStatus: status, teApprovalLevel: 0, teWorkerId: 50, update: vi.fn().mockResolvedValue(undefined) });
        db.Worker = { findByPk: vi.fn().mockResolvedValue({ workerUserId }) };
        // No active approval chain by default → single approve → approved.
        db.ApprovalChain = { findOne: vi.fn().mockResolvedValue(null) };
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

    test('separation of duties: a manager cannot approve their OWN logged time → 403', async () => {
        // The entry's worker is linked to the acting user (workerUserId == ACTOR).
        mock('manager', 1, 'submitted', ACTOR);
        expect((await post()).status).toBe(403);
    });

    test('a manager CAN approve another worker\'s time (worker linked to a different user) → 200', async () => {
        mock('manager', 1, 'submitted', 777); // worker's user != actor
        expect((await post()).status).toBe(200);
    });

    // Multi-level approval-chain enforcement (#6). A 2-level chain: level 1
    // manager, level 2 admin. Each approve advances one level; 'approved' only
    // once the final level clears.
    const LEVELS = [{ level: 1, approverRole: 'manager' }, { level: 2, approverRole: 'admin' }];
    function mockChain(actorRole, levels, currentLevel) {
        const update = vi.fn().mockResolvedValue(undefined);
        db.User = { findByPk: vi.fn().mockResolvedValue({ userId: ACTOR, userCompId: 1, userRole: actorRole, userArch: false }) };
        db.TimeEntry.findByPk = vi.fn().mockResolvedValue({ teId: ENTRY, teCompId: 1, teArch: false, teApprovalStatus: 'submitted', teApprovalLevel: currentLevel, teWorkerId: 50, update });
        db.Worker = { findByPk: vi.fn().mockResolvedValue({ workerUserId: 999 }) };
        db.ApprovalChain = { findOne: vi.fn().mockResolvedValue({ apchLevels: levels, apchActive: true }) };
        return update;
    }

    test('level 1: a manager advances the entry one level but it stays submitted', async () => {
        const update = mockChain('manager', LEVELS, 0);
        expect((await post()).status).toBe(200);
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ teApprovalLevel: 1, teApprovalStatus: 'submitted' }));
    });

    test('final level: an admin clears level 2 → approved', async () => {
        const update = mockChain('admin', LEVELS, 1);
        expect((await post()).status).toBe(200);
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ teApprovalLevel: 2, teApprovalStatus: 'approved' }));
    });

    test('a manager cannot approve the admin-required level 2 → 403, no update', async () => {
        const update = mockChain('manager', LEVELS, 1); // next required level = admin
        expect((await post()).status).toBe(403);
        expect(update).not.toHaveBeenCalled();
    });
});
