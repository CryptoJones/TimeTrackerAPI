// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration test for the web-app account flow against real Postgres:
// signup creates a user + workspace + session key; the key resolves to
// the workspace company; login re-issues a key; me resolves it; wrong
// password 401s; duplicate signup 409s. Auto-skips without a database.
//
// Signup runs once in beforeAll (not in a test body) so the suite-level
// retry can re-run the read-only assertions without tripping the
// unique-email 409 on a second signup.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const auth = require('../../app/middleware/auth.js');

const HAS_DB = Boolean(process.env.DB_PASSWORD);
const EMAIL = `_integ_acct_${process.pid}_${Date.now()}@example.test`;
const PASSWORD = 'correct horse battery';

let db;
let authController;
let connected = false;
let companyId = null;
let signup = null;
let signupKey = null;

function res() {
    return {
        status(c) { this._code = c; return this; },
        json(b) { this._body = b; return this; },
    };
}

beforeAll(async () => {
    if (!HAS_DB) return;
    db = require('../../app/config/db.config.js');
    authController = require('../../app/controllers/authcontroller.js');
    try {
        await db.sequelize.authenticate();
        connected = true;
    } catch (err) {
        console.warn('[integration] PG unreachable, skipping suite:', err.message);
        return;
    }
    signup = res();
    await authController.signup(
        { body: { email: EMAIL, password: PASSWORD, companyName: 'Acct Test' } }, signup);
    if (signup._code === 201) {
        companyId = signup._body.user.companyId;
        signupKey = signup._body.apiKey;
    }
}, 30000);

afterAll(async () => {
    if (!connected || !db || !companyId) return;
    const q = (sql, repl) => db.sequelize.query(sql, { replacements: repl })
        .catch((e) => console.warn('[integration] cleanup failed:', e.message));
    await q('DELETE FROM "dbo"."ApiKey" WHERE "akCompanyId" = ?', [companyId]);
    await q('DELETE FROM "dbo"."User" WHERE "usrCompId" = ?', [companyId]);
    await q('DELETE FROM "dbo"."Company" WHERE "compId" = ?', [companyId]);
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
});

describe.skipIf(!HAS_DB)('integration: web-app accounts', () => {
    test('signup creates a user + workspace and returns a session key', () => {
        expect(signup._code).toBe(201);
        expect(signup._body.user.email).toBe(EMAIL);
        expect(typeof signupKey).toBe('string');
        expect(companyId).toBeGreaterThan(0);
    });

    test('the session key resolves to the workspace company', async () => {
        expect(await auth.getCompanyId(signupKey)).toBe(companyId);
    });

    test('login returns a working key and me resolves it', async () => {
        const l = res();
        await authController.login({ body: { email: EMAIL, password: PASSWORD } }, l);
        expect(l._code).toBe(200);
        expect(await auth.getCompanyId(l._body.apiKey)).toBe(companyId);

        const m = res();
        await authController.me({ get: (h) => (h === 'authKey' ? l._body.apiKey : undefined) }, m);
        expect(m._code).toBe(200);
        expect(m._body.user.email).toBe(EMAIL);
        expect(m._body.user.companyId).toBe(companyId);
    });

    test('wrong password is 401', async () => {
        const bad = res();
        await authController.login({ body: { email: EMAIL, password: 'wrong' } }, bad);
        expect(bad._code).toBe(401);
    });

    test('duplicate signup is 409', async () => {
        const dup = res();
        await authController.signup({ body: { email: EMAIL, password: PASSWORD } }, dup);
        expect(dup._code).toBe(409);
    });
});
