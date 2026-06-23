// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration test for the web-app account flow against real Postgres:
// signup creates a user + workspace + session key; the key authenticates
// a normal endpoint; login re-issues a key; me resolves it; wrong
// password 401s; duplicate signup 409s. Auto-skips without a database.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = Boolean(process.env.DB_PASSWORD);
const EMAIL = `_integ_acct_${process.pid}_${Date.now()}@example.test`;
const PASSWORD = 'correct horse battery';

let db;
let authController;
let customerController;
let connected = false;
let companyId = null;

function res() {
    return {
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this._code = c; return this; },
        json(b) { this._body = b; return this; },
        send(b) { this._body = b; return this; },
    };
}

beforeAll(async () => {
    if (!HAS_DB) return;
    db = require('../../app/config/db.config.js');
    authController = require('../../app/controllers/authcontroller.js');
    customerController = require('../../app/controllers/customercontroller.js');
    try {
        await db.sequelize.authenticate();
        connected = true;
    } catch (err) {
        console.warn('[integration] PG unreachable, skipping suite:', err.message);
    }
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    const q = (sql, repl) => db.sequelize.query(sql, { replacements: repl })
        .catch((e) => console.warn('[integration] cleanup failed:', e.message));
    if (companyId) {
        await q('DELETE FROM "dbo"."ApiKey" WHERE "akCompanyId" = ?', [companyId]);
        await q('DELETE FROM "dbo"."User" WHERE "usrCompId" = ?', [companyId]);
        await q('DELETE FROM "dbo"."Company" WHERE "compId" = ?', [companyId]);
    }
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
});

describe.skipIf(!HAS_DB)('integration: web-app accounts', () => {
    test('signup → key authenticates → login → me → 401 → 409', async () => {
        // Signup.
        const s = res();
        await authController.signup({ body: { email: EMAIL, password: PASSWORD, companyName: 'Acct Test' } }, s);
        expect(s._code).toBe(201);
        expect(s._body.user.email).toBe(EMAIL);
        expect(typeof s._body.apiKey).toBe('string');
        companyId = s._body.user.companyId;
        const signupKey = s._body.apiKey;

        // The session key authenticates a normal company-scoped endpoint.
        const list = res();
        await customerController.listByCompany(
            { get: (h) => (h === 'authKey' ? signupKey : undefined), params: { id: companyId }, query: {} },
            list);
        expect(list._code).toBe(200);

        // Login re-issues a working key.
        const l = res();
        await authController.login({ body: { email: EMAIL, password: PASSWORD } }, l);
        expect(l._code).toBe(200);
        expect(typeof l._body.apiKey).toBe('string');
        const loginKey = l._body.apiKey;

        // me resolves the key to the user + workspace.
        const m = res();
        await authController.me({ get: (h) => (h === 'authKey' ? loginKey : undefined) }, m);
        expect(m._code).toBe(200);
        expect(m._body.user.email).toBe(EMAIL);
        expect(m._body.user.companyId).toBe(companyId);

        // Wrong password → 401.
        const bad = res();
        await authController.login({ body: { email: EMAIL, password: 'wrong' } }, bad);
        expect(bad._code).toBe(401);

        // Duplicate signup → 409.
        const dup = res();
        await authController.signup({ body: { email: EMAIL, password: PASSWORD } }, dup);
        expect(dup._code).toBe(409);
    });
});
