// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP contract tests for /v1/user (#444) — auth + schema.

import { describe, test, expect, vi, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: { Op: {} },
    Customer: {}, Worker: {}, BillingType: {}, InventoryItem: {}, Company: {}, Job: {}, Invoice: {}, CustomerPayment: {}, Expense: {}, AuditLog: {}, Task: {}, Retainer: {}, Phase: {}, Role: {}, RecurringInvoice: {}, Webhook: {}, TimeEntry: {}, RateSchedule: {},
    User: { findByPk: vi.fn().mockResolvedValue(null), findOne: vi.fn().mockResolvedValue(null), findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }), create: vi.fn() },
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

const good = { userEmail: 'jane@co.com', password: 'hunter2hunter2' };

describe('User account auth + schema contract', () => {
    test('POST 403 without authKey (valid body reaches controller)', async () => {
        expect((await request(app).post('/v1/user').send(good)).status).toBe(403);
    });
    test('POST 400 on a missing password (schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ userEmail: 'jane@co.com' })).status).toBe(400);
    });
    test('POST 400 on a too-short password (schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ userEmail: 'jane@co.com', password: 'short' })).status).toBe(400);
    });
    test('POST 400 on an invalid email (schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ userEmail: 'not-an-email', password: 'hunter2hunter2' })).status).toBe(400);
    });
    test('POST 400 on an unknown field (strict schema)', async () => {
        expect((await request(app).post('/v1/user').set('authKey', 'k').send({ ...good, isAdmin: true })).status).toBe(400);
    });
    test('GET /:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/user/1')).status).toBe(403);
    });
    test('GET /bycompany/:id 403 without authKey', async () => {
        expect((await request(app).get('/v1/user/bycompany/1')).status).toBe(403);
    });
});

// RBAC enforcement for a signed-in USER (Bearer JWT actor) on setRole (#448).
// attachUser resolves the actor; findScoped resolves the target; both go
// through the mocked db.User.findByPk (dispatched by id).
describe('setRole — RBAC enforced for a JWT actor', () => {
    const jwt = require('../../app/services/jwt.js');
    const db = require('../../app/config/db.config.js');
    const SECRET = 'test-secret';
    const ACTOR = 100; const TARGET = 200;

    function actorToken(comp = 1) {
        process.env.JWT_SECRET = SECRET;
        return jwt.sign({ sub: ACTOR, userCompId: comp }, SECRET, 3600);
    }
    function mockUsers(actorRole, targetRole, targetComp = 1) {
        const target = { userId: TARGET, userCompId: targetComp, userRole: targetRole, userArch: false, update: vi.fn().mockResolvedValue(undefined) };
        db.User.findByPk = vi.fn().mockImplementation((id) => {
            if (Number(id) === ACTOR) return Promise.resolve({ userId: ACTOR, userCompId: 1, userRole: actorRole, userArch: false });
            if (Number(id) === TARGET) return Promise.resolve(target);
            return Promise.resolve(null);
        });
        return target;
    }
    afterEach(() => { delete process.env.JWT_SECRET; });

    function patchRole(newRole) {
        return request(app).patch(`/v1/user/${TARGET}/role`).set('authorization', `Bearer ${actorToken()}`).send({ userRole: newRole });
    }

    test('admin promotes a member to manager → 200', async () => {
        const target = mockUsers('admin', 'member');
        const res = await patchRole('manager');
        expect(res.status).toBe(200);
        expect(target.update).toHaveBeenCalledWith({ userRole: 'manager' });
    });

    test('admin cannot escalate a member to owner → 403', async () => {
        const target = mockUsers('admin', 'member');
        const res = await patchRole('owner');
        expect(res.status).toBe(403);
        expect(target.update).not.toHaveBeenCalled();
    });

    test('admin cannot modify an owner (target out-ranks) → 403', async () => {
        const target = mockUsers('admin', 'owner');
        expect((await patchRole('member')).status).toBe(403);
        expect(target.update).not.toHaveBeenCalled();
    });

    test('manager (no manage-roles) cannot set roles → 403', async () => {
        const target = mockUsers('manager', 'member');
        expect((await patchRole('viewer')).status).toBe(403);
        expect(target.update).not.toHaveBeenCalled();
    });

    test('a cross-company target is a secure-404 for a JWT actor', async () => {
        mockUsers('admin', 'member', 2); // target in company 2; actor in company 1
        expect((await patchRole('manager')).status).toBe(404);
    });
});

// JWT-actor RBAC on the read / update / remove user endpoints.
describe('user read/update/remove — RBAC for a JWT actor', () => {
    const jwt = require('../../app/services/jwt.js');
    const db = require('../../app/config/db.config.js');
    const SECRET = 'test-secret';
    const ACTOR = 100; const TARGET = 200;

    function actorToken() {
        process.env.JWT_SECRET = SECRET;
        return jwt.sign({ sub: ACTOR, userCompId: 1 }, SECRET, 3600);
    }
    function row(id, comp, role) {
        return { userId: id, userCompId: comp, userRole: role, userArch: false, userEmail: 'x@y.co', userName: 'X', update: vi.fn().mockResolvedValue(undefined) };
    }
    // targetComp/targetId let a test point the target at another company or at
    // the actor itself (self-edit). The ACTOR row always carries update().
    function mockUsers(actorRole, targetComp = 1, targetId = TARGET) {
        db.User.findByPk = vi.fn().mockImplementation((id) => {
            if (Number(id) === ACTOR) return Promise.resolve(row(ACTOR, 1, actorRole));
            if (Number(id) === targetId) return Promise.resolve(row(targetId, targetComp, 'member'));
            return Promise.resolve(null);
        });
    }
    afterEach(() => { delete process.env.JWT_SECRET; });
    const bearer = () => ({ authorization: `Bearer ${actorToken()}` });

    test('GET a user in own company → 200; cross-company → secure-404', async () => {
        mockUsers('member');
        expect((await request(app).get(`/v1/user/${TARGET}`).set(bearer())).status).toBe(200);
        mockUsers('member', 2);
        expect((await request(app).get(`/v1/user/${TARGET}`).set(bearer())).status).toBe(404);
    });

    test('listByCompany: own company 200, other company 403', async () => {
        mockUsers('member');
        db.User.findAndCountAll = vi.fn().mockResolvedValue({ count: 0, rows: [] });
        expect((await request(app).get('/v1/user/bycompany/1').set(bearer())).status).toBe(200);
        expect((await request(app).get('/v1/user/bycompany/2').set(bearer())).status).toBe(403);
    });

    test('member updates its OWN profile (200) but not another user (403); admin can (200)', async () => {
        mockUsers('member', 1, ACTOR); // target == actor (self)
        expect((await request(app).patch(`/v1/user/${ACTOR}`).set(bearer()).send({ userName: 'New' })).status).toBe(200);
        mockUsers('member'); // another user, member lacks user:write
        expect((await request(app).patch(`/v1/user/${TARGET}`).set(bearer()).send({ userName: 'New' })).status).toBe(403);
        mockUsers('admin');
        expect((await request(app).patch(`/v1/user/${TARGET}`).set(bearer()).send({ userName: 'New' })).status).toBe(200);
    });

    test('remove: member 403, admin 200', async () => {
        mockUsers('member');
        expect((await request(app).delete(`/v1/user/${TARGET}`).set(bearer())).status).toBe(403);
        mockUsers('admin');
        expect((await request(app).delete(`/v1/user/${TARGET}`).set(bearer())).status).toBe(200);
    });
});
