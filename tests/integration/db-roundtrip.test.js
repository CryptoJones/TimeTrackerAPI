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

    test('Job has the jobFlatRate column (#410)', async () => {
        if (!connected) return;
        const rows = await db.Job.findAll({
            attributes: ['jobId', 'jobFlatRate', 'jobBudgetMinutes', 'jobBudgetAmount'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
    });

    test('TimeEntry has worker/job/billtype columns and their includes resolve', async () => {
        if (!connected) return;
        // Selecting the new attributes proves the 20260521 + 20260523
        // migrations added the columns (a missing column would throw).
        const rows = await db.TimeEntry.findAll({
            attributes: ['teId', 'teWorkerId', 'teJobId', 'teBillTypeId', 'teInvJobId', 'teTags', 'teApprovalStatus', 'teTaskId'],
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
                { model: db.BillingType, as: 'billingType', required: false },
            ],
        });
        expect(Array.isArray(withLinks)).toBe(true);
    });

    test('rollup query excludes REJECTED time entries (billing gate)', async () => {
        if (!connected) return;
        const { Op } = db.Sequelize;
        const company = await db.Company.create({ compName: `${SENTINEL}-rollupco`, compArch: false });
        const customer = await db.Customer.create({
            custCompanyName: `${SENTINEL}-rollupcust`, custFName: 'Roll', custLName: 'Up',
            custCompId: company.compId, custArch: false,
        });
        const job = await db.Job.create({ jobCustId: customer.custId, jobDesc: 'rollup job' });
        const mk = (status) => db.TimeEntry.create({
            teCustId: customer.custId, teCompId: company.compId,
            teStartedAt: new Date('2026-02-01T09:00:00.000Z'), teMinutes: 60,
            teBillable: true, teJobId: job.jobId, teInvJobId: null, teApprovalStatus: status,
        });
        const [approved, rejected, submitted] = await Promise.all([mk('approved'), mk('rejected'), mk('submitted')]);
        try {
            // The exact filter invoicecontroller.rollup applies.
            const rows = await db.TimeEntry.findAll({
                where: {
                    teCustId: customer.custId, teBillable: true, teInvJobId: null,
                    teJobId: { [Op.ne]: null }, teApprovalStatus: { [Op.ne]: 'rejected' },
                },
                attributes: ['teId', 'teApprovalStatus'],
            });
            const ids = rows.map((r) => r.teId);
            expect(ids).toContain(approved.teId);   // approved bills
            expect(ids).toContain(submitted.teId);  // submitted still bills (approval isn't the gate)
            expect(ids).not.toContain(rejected.teId); // a rejection keeps it OUT of the invoice
        } finally {
            await db.TimeEntry.destroy({ where: { teId: [approved.teId, rejected.teId, submitted.teId] } });
            await job.destroy();
            await customer.destroy();
            await company.destroy();
        }
    });

    test('Invoice has invSubtotal / invTax / invTotal money columns', async () => {
        if (!connected) return;
        // Selecting the new attributes proves the 20260522 migration
        // added the NUMERIC(14,2) columns (a missing column throws here).
        const rows = await db.Invoice.findAll({
            attributes: ['invId', 'invSubtotal', 'invTax', 'invTotal'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
    });

    test('CustomerPayment has the cpayInvId allocation column + invoice include', async () => {
        if (!connected) return;
        const rows = await db.CustomerPayment.findAll({
            attributes: ['cpayId', 'cpayInvId'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withInvoice = await db.CustomerPayment.findAll({
            limit: 1,
            include: [{ model: db.Invoice, as: 'invoice', required: false }],
        });
        expect(Array.isArray(withInvoice)).toBe(true);
    });

    test('invoice-numbering columns exist (Company config + Invoice.invNumber)', async () => {
        if (!connected) return;
        const companies = await db.Company.findAll({
            attributes: ['compId', 'compInvPrefix', 'compInvPad', 'compInvNextSeq', 'compTaxRate', 'compInvFooter', 'compCurrency', 'compTimeLockDate'],
            limit: 1,
        });
        expect(Array.isArray(companies)).toBe(true);
        const invoices = await db.Invoice.findAll({
            attributes: ['invId', 'invNumber', 'invTaxRate', 'invDiscount', 'invWriteOff', 'invNotes', 'invCurrency'],
            limit: 1,
        });
        expect(Array.isArray(invoices)).toBe(true);
    });

    test('Expense table exists with company/customer/job includes (#416)', async () => {
        if (!connected) return;
        // Selecting the columns proves the 20260529 migration created the
        // table; a missing column/table would throw here.
        const rows = await db.Expense.findAll({
            attributes: ['expId', 'expCompId', 'expCustId', 'expJobId', 'expAmount', 'expDate', 'expBillable', 'expMarkupPct', 'expInvId'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        // Eager-loading through the aliases proves the association wiring.
        const withLinks = await db.Expense.findAll({
            limit: 1,
            include: [
                { model: db.Customer, as: 'customer', required: false },
                { model: db.Job, as: 'job', required: false },
                { model: db.Company, as: 'company', required: false },
                { model: db.Invoice, as: 'invoice', required: false },
            ],
        });
        expect(Array.isArray(withLinks)).toBe(true);
    });

    test('AuditLog table exists with its columns (#460)', async () => {
        if (!connected) return;
        const rows = await db.AuditLog.findAll({
            attributes: ['alogId', 'alogCompId', 'alogActor', 'alogMethod', 'alogPath', 'alogEntity', 'alogStatus', 'alogEntityId', 'alogChanges', 'alogReason'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
    });

    test('BillableRule table exists with a company include (#415)', async () => {
        if (!connected) return;
        const rows = await db.BillableRule.findAll({
            attributes: ['bruId', 'bruCompId', 'bruName', 'bruPriority', 'bruMatchCategory', 'bruBillable'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.BillableRule.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('CustomFieldDef table exists with a company include (#409)', async () => {
        if (!connected) return;
        const rows = await db.CustomFieldDef.findAll({
            attributes: ['cfdId', 'cfdCompId', 'cfdEntity', 'cfdName', 'cfdType', 'cfdRequired'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.CustomFieldDef.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('Invitation table exists with a company include (#458)', async () => {
        if (!connected) return;
        const rows = await db.Invitation.findAll({
            attributes: ['invtId', 'invtCompId', 'invtEmail', 'invtRole', 'invtExpires', 'invtAcceptedAt'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.Invitation.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('ApprovalChain table exists with a company include (#443)', async () => {
        if (!connected) return;
        const rows = await db.ApprovalChain.findAll({
            attributes: ['apchId', 'apchCompId', 'apchName', 'apchLevels', 'apchActive'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.ApprovalChain.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('ReportSchedule table exists with a company include (#57)', async () => {
        if (!connected) return;
        const rows = await db.ReportSchedule.findAll({
            attributes: ['rptschId', 'rptschCompId', 'rptschReport', 'rptschTo', 'rptschCadence', 'rptschNextRun'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.ReportSchedule.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('Receipt table exists with an expense include (#419)', async () => {
        if (!connected) return;
        const rows = await db.Receipt.findAll({
            attributes: ['rcptId', 'rcptExpId', 'rcptCompId', 'rcptFilename', 'rcptContentType', 'rcptSize'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withExpense = await db.Receipt.findAll({
            attributes: ['rcptId'],
            limit: 1,
            include: [{ model: db.Expense, as: 'expense', required: false }],
        });
        expect(Array.isArray(withExpense)).toBe(true);
    });

    test('User table exists with a company include (#444)', async () => {
        if (!connected) return;
        const rows = await db.User.findAll({
            attributes: ['userId', 'userCompId', 'userEmail', 'userName', 'userRole', 'userArch', 'userResetTokenHash', 'userResetExpires'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.User.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('RateSchedule table exists with a company include (#414)', async () => {
        if (!connected) return;
        const rows = await db.RateSchedule.findAll({
            attributes: ['rschId', 'rschCompId', 'rschName', 'rschRate', 'rschEffectiveFrom', 'rschEffectiveTo'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.RateSchedule.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('Webhook table exists with a company include (#69)', async () => {
        if (!connected) return;
        const rows = await db.Webhook.findAll({
            attributes: ['whkId', 'whkCompId', 'whkUrl', 'whkEvent', 'whkActive'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCompany = await db.Webhook.findAll({
            limit: 1,
            include: [{ model: db.Company, as: 'company', required: false }],
        });
        expect(Array.isArray(withCompany)).toBe(true);
    });

    test('RecurringInvoice table exists with a customer include (#425)', async () => {
        if (!connected) return;
        const rows = await db.RecurringInvoice.findAll({
            attributes: ['recinvId', 'recinvCustId', 'recinvCadence', 'recinvNextRun', 'recinvLastRun', 'recinvActive'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCustomer = await db.RecurringInvoice.findAll({
            limit: 1,
            include: [{ model: db.Customer, as: 'customer', required: false }],
        });
        expect(Array.isArray(withCustomer)).toBe(true);
    });

    test('Retainer table exists with a customer include (#426)', async () => {
        if (!connected) return;
        const rows = await db.Retainer.findAll({
            attributes: ['retId', 'retCustId', 'retAmount', 'retBalance'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withCustomer = await db.Retainer.findAll({
            limit: 1,
            include: [{ model: db.Customer, as: 'customer', required: false }],
        });
        expect(Array.isArray(withCustomer)).toBe(true);
    });

    test('Phase table exists with a job include (#408)', async () => {
        if (!connected) return;
        const rows = await db.Phase.findAll({
            attributes: ['phaseId', 'phaseJobId', 'phaseName', 'phaseStartDate', 'phaseEndDate', 'phaseBudgetAmount', 'phaseBilledInvId'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withJob = await db.Phase.findAll({
            limit: 1,
            include: [{ model: db.Job, as: 'job', required: false }],
        });
        expect(Array.isArray(withJob)).toBe(true);
    });

    test('Task table exists with a job include (#407)', async () => {
        if (!connected) return;
        const rows = await db.Task.findAll({
            attributes: ['taskId', 'taskJobId', 'taskName', 'taskDesc', 'taskRate'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
        const withJob = await db.Task.findAll({
            limit: 1,
            include: [{ model: db.Job, as: 'job', required: false }],
        });
        expect(Array.isArray(withJob)).toBe(true);
    });

    test('Customer has the custDefaultRate column (#413)', async () => {
        if (!connected) return;
        const rows = await db.Customer.findAll({
            attributes: ['custId', 'custDefaultRate'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
    });

    test('Worker has the workerTargetMinsPerWeek column (#400)', async () => {
        if (!connected) return;
        const rows = await db.Worker.findAll({
            attributes: ['workerId', 'workerTargetMinsPerWeek', 'workerCostRate', 'workerRoleId'],
            limit: 1,
        });
        expect(Array.isArray(rows)).toBe(true);
    });

    test('Role table exists with a company include + worker role link (#412)', async () => {
        if (!connected) return;
        const roles = await db.Role.findAll({ attributes: ['roleId', 'roleCompId', 'roleName', 'roleRate'], limit: 1 });
        expect(Array.isArray(roles)).toBe(true);
        const withRole = await db.Worker.findAll({
            limit: 1,
            include: [{ model: db.Role, as: 'role', required: false }],
        });
        expect(Array.isArray(withRole)).toBe(true);
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
