// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration test for the invoicing & payments money flow against a
// real Postgres. Validates the step-1 migration (cpayInvId, invStatus),
// the Invoice→lines / Invoice→payments associations, and the money
// module's total/paid/balance/status math on real rows — the part the
// api-tier unit tests can't reach (vi.mock doesn't intercept the
// controller's captured models). Auto-skips without a database.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const money = require('../../app/services/money.js');

const HAS_DB = Boolean(process.env.DB_PASSWORD);
const SENTINEL = `_integpay_${process.pid}_${Date.now()}`;

let db;
let connected = false;
const ids = {};

beforeAll(async () => {
    if (!HAS_DB) return;
    db = require('../../app/config/db.config.js');
    try {
        await db.sequelize.authenticate();
        connected = true;
    } catch (err) {
        console.warn('[integration] PG unreachable, skipping suite:', err.message);
        return;
    }
    // Fixture chain: Company → Customer → Job → Invoice → one line ($100).
    const company = await db.Company.create({ compName: `${SENTINEL}_co`, compArch: false });
    ids.company = company.compId;
    const customer = await db.Customer.create({
        custCompId: company.compId,
        custCompanyName: `${SENTINEL}_cust`,
        custFName: 'Integ', custLName: 'Test', custArch: false,
    });
    ids.customer = customer.custId;
    const job = await db.Job.create({
        jobCustId: customer.custId, jobDesc: `${SENTINEL}_job`,
        jobArch: false, jobInvoiced: false,
    });
    ids.job = job.jobId;
    const invoice = await db.Invoice.create({
        invCustId: customer.custId, invDate: '2026-01-01', invDueDate: '2026-02-01',
        invPaid: false, invArch: false,
    });
    ids.invoice = invoice.invId;
    const line = await db.InvoiceJob.create({
        injbInvId: invoice.invId, injbJobId: job.jobId, injbAmount: 100, injbArch: false,
    });
    ids.line = line.injbId;
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    const q = (sql, repl) => db.sequelize.query(sql, { replacements: repl }).catch((e) =>
        console.warn('[integration] cleanup failed:', e.message));
    // FK-safe order (no DB-level FKs here, but tidy regardless).
    await q('DELETE FROM "dbo"."CustomerPayment" WHERE "cpayInvId" = ?', [ids.invoice]);
    await q('DELETE FROM "dbo"."InvoiceJob" WHERE "injbInvId" = ?', [ids.invoice]);
    await q('DELETE FROM "dbo"."Invoice" WHERE "invId" = ?', [ids.invoice]);
    await q('DELETE FROM "dbo"."Job" WHERE "jobId" = ?', [ids.job]);
    await q('DELETE FROM "dbo"."Customer" WHERE "custId" = ?', [ids.customer]);
    await q('DELETE FROM "dbo"."Company" WHERE "compId" = ?', [ids.company]);
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
});

async function reloadSummary() {
    const inv = await db.Invoice.findByPk(ids.invoice, {
        include: [
            { model: db.InvoiceJob, as: 'lines', required: false },
            { model: db.CustomerPayment, as: 'payments', required: false },
        ],
    });
    return money.summarize(inv, inv.lines, inv.payments);
}

describe.skipIf(!HAS_DB)('integration: invoice payments + balance', () => {
    test('migration columns exist and an unpaid invoice has full balance', async () => {
        const s = await reloadSummary();
        expect(s).toEqual({ total: 100, paid: 0, balance: 100, status: 'draft' });
    });

    test('a partial payment leaves a remaining balance and partial status', async () => {
        await db.CustomerPayment.create({
            cpayCustId: ids.customer, cpayInvId: ids.invoice,
            cpayAmount: 40, cpayDate: '2026-01-15', cpayArch: false,
        });
        const s = await reloadSummary();
        expect(s).toEqual({ total: 100, paid: 40, balance: 60, status: 'partial' });
    });

    test('paying the remainder clears the balance and marks it paid', async () => {
        await db.CustomerPayment.create({
            cpayCustId: ids.customer, cpayInvId: ids.invoice,
            cpayAmount: 60, cpayDate: '2026-01-20', cpayArch: false,
        });
        const s = await reloadSummary();
        expect(s).toEqual({ total: 100, paid: 100, balance: 0, status: 'paid' });
    });
});
