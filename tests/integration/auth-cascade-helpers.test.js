// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration tests for the cascade-scoped auth helpers in
// `app/middleware/auth.js`:
//
//   getCompanyIdByCustomerId(custId)  — Customer-scoped entities
//   getCompanyIdByJobId(jobId)        — Job → Customer → company
//   getCompanyIdByPovId(povId)        — Vendor-scoped entities
//   getCompanyIdByPohId(pohId)        — Header → Vendor → company
//
// These helpers issue Sequelize queries with `include` joins. Real-PG
// coverage matters because:
//
// 1. The `required: true` INNER JOIN semantics mean an archived
//    parent in the cascade silently drops the whole row to -1 —
//    that's the correct security behavior (the parent's scope no
//    longer applies), but only a live DB verifies the SQL emits it.
//
// 2. P5-M moved every helper from raw `sequelize.query` strings to
//    Sequelize model includes; the unit-level fixtures don't
//    exercise the actual JOIN generation, only the result-shape
//    mapping.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = Boolean(process.env.DB_PASSWORD);

const SENTINEL = `_integ_cascade_${process.pid}_${Date.now()}`;

let db;
let auth;
let connected = false;
let companyId;
let customerId;
let jobId;
let vendorId;
let headerId;

beforeAll(async () => {
    if (!HAS_DB) return;
    db = require('../../app/config/db.config.js');
    auth = require('../../app/middleware/auth.js');
    try {
        await db.sequelize.authenticate();
        connected = true;
    } catch (err) {
        console.warn('[auth-cascade] PG unreachable, skipping:', err.message);
        return;
    }

    // Build the cascade: Company → Customer → Job, and
    // Company → Vendor → Header. Each step uses the SENTINEL prefix
    // so cleanup is easy.
    const company = await db.Company.create({
        compName: `${SENTINEL}-company`,
        compArch: false,
    });
    companyId = company.compId;

    const customer = await db.Customer.create({
        custCompanyName: `${SENTINEL}-customer`,
        custCompId: companyId,
        custArch: false,
    });
    customerId = customer.custId;

    const job = await db.Job.create({
        jobCustId: customerId,
        jobDesc: `${SENTINEL}-job`,
        jobArch: false,
    });
    jobId = job.jobId;

    const vendor = await db.PurchaseOrderVendor.create({
        povName: `${SENTINEL}-vendor`,
        povMailingAddress1: '123 Test St',
        povMailingCity: 'Lincoln',
        povCompId: companyId,
        povArch: false,
    });
    vendorId = vendor.povId;

    const header = await db.PurchaseOrderHeader.create({
        pohDate: new Date(),
        pohReference: `${SENTINEL}-poh`,
        pohTerms: 'Net 30',
        pohPovId: vendorId,
        pohArch: false,
    });
    headerId = header.pohId;
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    try {
        // FK-aware cleanup: lines/headers first, then vendors;
        // jobs/customers/company last. Use raw DELETE so default
        // scope doesn't hide our archived sentinel rows.
        await db.sequelize.query(
            'DELETE FROM "dbo"."PurchaseOrderHeaders" WHERE "pohReference" LIKE ?',
            { replacements: [`${SENTINEL}%`] },
        );
        await db.sequelize.query(
            'DELETE FROM "dbo"."PurchaseOrderVendors" WHERE "povName" LIKE ?',
            { replacements: [`${SENTINEL}%`] },
        );
        await db.sequelize.query(
            'DELETE FROM "dbo"."Job" WHERE "jobDesc" LIKE ?',
            { replacements: [`${SENTINEL}%`] },
        );
        await db.sequelize.query(
            'DELETE FROM "dbo"."Customer" WHERE "custCompanyName" LIKE ?',
            { replacements: [`${SENTINEL}%`] },
        );
        await db.sequelize.query(
            'DELETE FROM "dbo"."Company" WHERE "compName" LIKE ?',
            { replacements: [`${SENTINEL}%`] },
        );
    } catch (e) {
        console.warn('[auth-cascade] cleanup failed:', e.message);
    }
});

describe.skipIf(!HAS_DB)('integration: cascade auth helpers against real PG', () => {
    test('getCompanyIdByCustomerId resolves through the Customer.custCompId column', async () => {
        if (!connected) return;
        expect(await auth.getCompanyIdByCustomerId(customerId)).toBe(companyId);
    });

    test('getCompanyIdByJobId resolves through Job → Customer → custCompId', async () => {
        if (!connected) return;
        expect(await auth.getCompanyIdByJobId(jobId)).toBe(companyId);
    });

    test('getCompanyIdByPovId resolves through the Vendor.povCompId column', async () => {
        if (!connected) return;
        expect(await auth.getCompanyIdByPovId(vendorId)).toBe(companyId);
    });

    test('getCompanyIdByPohId resolves through Header → Vendor → povCompId', async () => {
        if (!connected) return;
        expect(await auth.getCompanyIdByPohId(headerId)).toBe(companyId);
    });

    test('helpers return -1 for nonexistent parent ids', async () => {
        if (!connected) return;
        const huge = 2_000_000_000;
        expect(await auth.getCompanyIdByCustomerId(huge)).toBe(-1);
        expect(await auth.getCompanyIdByJobId(huge)).toBe(-1);
        expect(await auth.getCompanyIdByPovId(huge)).toBe(-1);
        expect(await auth.getCompanyIdByPohId(huge)).toBe(-1);
    });

    test('cascade INNER JOIN drops the row when an intermediate parent is archived', async () => {
        if (!connected) return;
        // Build an isolated chain: company → customer → job, then archive
        // the customer. getCompanyIdByJobId should now return -1 because
        // the join's `required: true` against defaultScope-filtered
        // Customer rules out the orphaned-feeling job.
        const isolatedCompany = await db.Company.create({
            compName: `${SENTINEL}-isolated-company`,
            compArch: false,
        });
        const archivedCustomer = await db.Customer.create({
            custCompanyName: `${SENTINEL}-arch-customer`,
            custCompId: isolatedCompany.compId,
            custArch: true,  // pre-archived
        });
        const orphanJob = await db.Job.create({
            jobCustId: archivedCustomer.custId,
            jobDesc: `${SENTINEL}-orphan-job`,
            jobArch: false,
        });
        expect(await auth.getCompanyIdByJobId(orphanJob.jobId)).toBe(-1);
    });
});
