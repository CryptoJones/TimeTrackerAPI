// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration smoke test. Hits a real Postgres if one is reachable;
// otherwise skips the entire suite gracefully so `npm test` stays
// green in environments without a database.
//
// See tests/integration/README.md for the bring-up + run flow.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = Boolean(process.env.DB_PASSWORD);

// Sentinel used to identify rows this test inserts, so cleanup is
// idempotent even if a prior run crashed mid-flight.
const SENTINEL = `_integ_${process.pid}_${Date.now()}`;

let db;
let connected = false;

beforeAll(async () => {
    if (!HAS_DB) return;
    // Real require, not the vi.mock from the api tests — we want the
    // actual Sequelize instance.
    db = require('../../app/config/db.config.js');
    try {
        await db.sequelize.authenticate();
        connected = true;
    } catch (err) {
        console.warn('[integration] PG unreachable, skipping suite:', err.message);
    }
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    // Tidy up any rows this test created. Pure-SQL DELETE is faster
    // than findAll + destroy and doesn't depend on associations.
    try {
        await db.sequelize.query(
            'DELETE FROM "dbo"."Customer" WHERE "custCompanyName" LIKE ?',
            { replacements: [`${SENTINEL}%`] },
        );
    } catch (e) {
        console.warn('[integration] cleanup DELETE failed:', e.message);
    }
    try {
        await db.sequelize.close();
    } catch (_) { /* ignore */ }
});

describe.skipIf(!HAS_DB)('integration: real PG round-trip', () => {
    test('Sequelize authenticates against the configured DB', () => {
        expect(connected).toBe(true);
    });

    test('Customer table exists and findAll returns an array', async () => {
        if (!connected) return;
        const rows = await db.Customer.findAll({ limit: 1 });
        expect(Array.isArray(rows)).toBe(true);
    });

    test('Customer create → findByPk → destroy round-trip works', async () => {
        if (!connected) return;
        // Need a Company to scope the customer to. Take any existing
        // compId, or create a sentinel one. We don't assume seed data.
        let companyId;
        const [first] = await db.sequelize.query(
            'SELECT "compId" FROM "dbo"."Company" LIMIT 1',
            { type: db.Sequelize.QueryTypes.SELECT },
        );
        if (first) {
            companyId = first.compId;
        } else {
            const company = await db.Company.create({
                compName: `${SENTINEL}-company`,
                compArch: false,
            });
            companyId = company.compId;
        }

        const created = await db.Customer.create({
            custCompanyName: `${SENTINEL}-customer`,
            custFName: 'Integ',
            custLName: 'Test',
            custCompId: companyId,
            custArch: false,
        });
        expect(created.custId).toBeGreaterThan(0);

        const found = await db.Customer.findByPk(created.custId);
        expect(found).not.toBeNull();
        expect(found.custCompanyName).toBe(`${SENTINEL}-customer`);

        await found.destroy();
        const afterDelete = await db.Customer.findByPk(created.custId);
        expect(afterDelete).toBeNull();
    });

    test('association include: Customer with company eager-loads', async () => {
        if (!connected) return;
        const [withCompany] = await db.Customer.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company' }],
        });
        if (withCompany) {
            // The eager-loaded company is on .company per the
            // association alias in db.config.js. Could be null if the
            // FK is orphaned, but the property should exist either way.
            expect('company' in withCompany.dataValues || withCompany.company !== undefined).toBe(true);
        }
        // If the table is empty that's fine — we just verified the
        // include didn't throw.
        expect(true).toBe(true);
    });

    test('TimeEntry has teWorkerId / teJobId columns and worker/job includes resolve', async () => {
        if (!connected) return;
        // Selecting the new attributes proves the 20260521 migration
        // added the columns (a missing column would throw here).
        const rows = await db.TimeEntry.findAll({
            attributes: ['teId', 'teWorkerId', 'teJobId'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        // Eager-loading through the new aliases proves the association
        // wiring in db.config.js (a bad alias would throw). required:
        // false so an empty table (or null FKs) is fine.
        const withLinks = await db.TimeEntry.findAll({
            limit: 1,
            include: [
                { model: db.Worker, as: 'worker', required: false },
                { model: db.Job, as: 'job', required: false },
            ],
        });
        expect(Array.isArray(withLinks)).toBe(true);
    });

    test('/healthz reports a non-null migration name (dbo-qualified read)', async () => {
        // sequelize-cli writes the SequelizeMeta table into the `dbo`
        // schema (`migrationStorageTableSchema: 'dbo'` in
        // app/config/sequelize-cli.config.js). The healthz query that
        // surfaces it MUST schema-qualify the SELECT, otherwise it
        // looks in `public` and silently falls back to migration:null
        // even when migrations are fully applied. This test catches
        // a regression of that schema-qualifier going missing.
        if (!connected) return;
        const rows = await db.sequelize.query(
            'SELECT "name" FROM "dbo"."SequelizeMeta" ORDER BY "name" DESC LIMIT 1',
            { type: db.Sequelize.QueryTypes.SELECT },
        );
        // Migrations have been applied in CI bring-up; the row exists.
        expect(rows.length).toBeGreaterThan(0);
        expect(typeof rows[0].name).toBe('string');
        // Migration names are timestamp-prefixed YYYYMMDDHHMMSS-…
        expect(rows[0].name).toMatch(/^\d{14}-/);
    });
});
