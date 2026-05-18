// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration tests for app/middleware/auth.js's helper functions
// against a real Postgres. The unit suite covers the helpers' branch
// logic via _setDbForTesting fixtures (P5-M); this suite verifies
// they actually talk to the schema correctly — column names,
// hash-at-rest semantics, defaultScope filtering of archived keys.
//
// Auto-skips when no DB_PASSWORD is set (matches tests/integration/
// README.md's skip behavior).

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';

const HAS_DB = Boolean(process.env.DB_PASSWORD);

// Sentinel for cleanup. Tokens are stored hashed, so we tag rows
// via the akCompanyId / amId hooks we control instead — see the
// per-test inserts below.
const SENTINEL_COMPANY_NAME = `_integ_auth_${process.pid}_${Date.now()}`;

let db;
let auth;
let connected = false;
let createdCompanyId;

function sha256(s) {
    return createHash('sha256').update(String(s)).digest('hex');
}

beforeAll(async () => {
    if (!HAS_DB) return;
    db = require('../../app/config/db.config.js');
    auth = require('../../app/middleware/auth.js');
    try {
        await db.sequelize.authenticate();
        connected = true;
    } catch (err) {
        // Surface the failure but skip — matches existing integration
        // convention.
        console.warn('[auth-helpers] PG unreachable, skipping:', err.message);
        return;
    }
    // Need a company to scope api keys to.
    const company = await db.Company.create({
        compName: SENTINEL_COMPANY_NAME,
        compArch: false,
    });
    createdCompanyId = company.compId;
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    try {
        // Wipe sentinel api keys / masters first (FK-free) then the
        // company row.
        await db.sequelize.query(
            'DELETE FROM "dbo"."ApiKey" WHERE "akCompanyId" = ?',
            { replacements: [createdCompanyId] },
        );
        await db.sequelize.query(
            'DELETE FROM "dbo"."ApiMaster" WHERE "amKEY" LIKE ?',
            { replacements: [`${sha256('_integ_auth_master_').slice(0, 16)}%`] },
        );
        await db.sequelize.query(
            'DELETE FROM "dbo"."Company" WHERE "compId" = ?',
            { replacements: [createdCompanyId] },
        );
    } catch (e) {
        console.warn('[auth-helpers] cleanup failed:', e.message);
    }
});

describe.skipIf(!HAS_DB)('integration: auth helpers against real PG', () => {
    test('isMaster returns true for an inserted master key, false for a fake', async () => {
        if (!connected) return;
        const rawToken = `_integ_auth_master_${randomUUID()}`;
        await db.ApiMaster.create({
            amKEY: sha256(rawToken),
            amArchive: false,
            // amArchiveDate is NOT NULL in the Atbash baseline schema.
            // We set a far-past sentinel so the row never looks
            // recently-archived to any future drift check.
            amArchiveDate: new Date(0),
        });
        expect(await auth.isMaster(rawToken)).toBe(true);
        expect(await auth.isMaster('definitely-not-a-real-token')).toBe(false);
    });

    test('getCompanyId resolves an inserted scoped key back to its company', async () => {
        if (!connected) return;
        const rawToken = `_integ_auth_scoped_${randomUUID()}`;
        await db.ApiKey.create({
            akKEY: sha256(rawToken),
            akCompanyId: createdCompanyId,
            akArchive: false,
            akArchiveDate: new Date(0),
        });
        expect(await auth.getCompanyId(rawToken)).toBe(createdCompanyId);
    });

    test('getCompanyId returns -1 for an unknown token', async () => {
        if (!connected) return;
        expect(await auth.getCompanyId(`unknown_${randomUUID()}`)).toBe(-1);
    });

    test('defaultScope hides archived ApiKey rows (P2-E behavior)', async () => {
        if (!connected) return;
        const rawToken = `_integ_auth_archived_${randomUUID()}`;
        const hashed = sha256(rawToken);
        await db.ApiKey.create({
            akKEY: hashed,
            akCompanyId: createdCompanyId,
            akArchive: true,  // pre-archived
            akArchiveDate: new Date(),
        });
        // P2-E's defaultScope filters akArchive=false, so the lookup
        // should miss this archived row.
        expect(await auth.getCompanyId(rawToken)).toBe(-1);
    });

    test('hashKey produces the same digest the migration uses', () => {
        // Pin the algorithm — if someone swaps it for bcrypt/argon2id,
        // every operator-held token rotates and this test fails as a
        // loud reminder to write a key-rotation migration.
        const sample = 'fixed-test-vector';
        expect(auth.hashKey(sample)).toBe(sha256(sample));
        expect(auth.hashKey(sample)).toHaveLength(64);
        expect(auth.hashKey(sample)).toMatch(/^[0-9a-f]{64}$/);
    });
});
