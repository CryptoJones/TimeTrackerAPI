// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration test for GET /v1/report/aging against real Postgres. One
// overdue invoice (balance 100) and one not-yet-due invoice (balance
// 150) for the same customer bucket into d31_60 and current as of a
// fixed date. Auto-skips without a database.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const auth = require('../../app/middleware/auth.js');

const HAS_DB = Boolean(process.env.DB_PASSWORD);
const KEY = `_integ_aging_master_${process.pid}_${Date.now()}`;

let db;
let controller;
let connected = false;
const ids = { invoices: [] };

beforeAll(async () => {
    if (!HAS_DB) return;
    db = require('../../app/config/db.config.js');
    controller = require('../../app/controllers/reportcontroller.js');
    try {
        await db.sequelize.authenticate();
        connected = true;
    } catch (err) {
        console.warn('[integration] PG unreachable, skipping suite:', err.message);
        return;
    }
    const master = await db.ApiMaster.create({
        amKEY: auth.hashKey(KEY), amArchive: false, amArchiveDate: '2000-01-01T00:00:00Z',
    });
    ids.master = master.amId;
    const company = await db.Company.create({ compName: `${KEY}_co`, compArch: false });
    ids.company = company.compId;
    const customer = await db.Customer.create({
        custCompId: company.compId, custCompanyName: `${KEY}_cust`,
        custFName: 'Ag', custLName: 'Ing', custArch: false,
    });
    ids.customer = customer.custId;

    // Overdue invoice: due 2026-01-01, $100 line, no payment → balance 100.
    const overdue = await db.Invoice.create({
        invCustId: customer.custId, invDate: '2025-12-01', invDueDate: '2026-01-01',
        invPaid: false, invStatus: 'sent', invArch: false,
    });
    ids.invoices.push(overdue.invId);
    await db.InvoiceJob.create({ injbInvId: overdue.invId, injbJobId: null, injbAmount: 100, injbArch: false });

    // Not-yet-due invoice: due 2026-12-31, $200 line, $50 paid → balance 150.
    const current = await db.Invoice.create({
        invCustId: customer.custId, invDate: '2026-02-01', invDueDate: '2026-12-31',
        invPaid: false, invStatus: 'sent', invArch: false,
    });
    ids.invoices.push(current.invId);
    await db.InvoiceJob.create({ injbInvId: current.invId, injbJobId: null, injbAmount: 200, injbArch: false });
    await db.CustomerPayment.create({
        cpayCustId: customer.custId, cpayInvId: current.invId,
        cpayAmount: 50, cpayDate: '2026-02-15', cpayArch: false,
    });
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    const q = (sql, repl) => db.sequelize.query(sql, { replacements: repl })
        .catch((e) => console.warn('[integration] cleanup failed:', e.message));
    for (const invId of ids.invoices) {
        await q('DELETE FROM "dbo"."CustomerPayment" WHERE "cpayInvId" = ?', [invId]);
        await q('DELETE FROM "dbo"."InvoiceJob" WHERE "injbInvId" = ?', [invId]);
        await q('DELETE FROM "dbo"."Invoice" WHERE "invId" = ?', [invId]);
    }
    await q('DELETE FROM "dbo"."Customer" WHERE "custId" = ?', [ids.customer]);
    await q('DELETE FROM "dbo"."Company" WHERE "compId" = ?', [ids.company]);
    await q('DELETE FROM "dbo"."ApiMaster" WHERE "amId" = ?', [ids.master]);
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
});

describe.skipIf(!HAS_DB)('integration: A/R aging report', () => {
    test('buckets overdue vs current balances per customer', async () => {
        const req = {
            get: (h) => (h === 'authKey' ? KEY : undefined),
            query: { companyId: ids.company, asOf: '2026-03-01' },
        };
        let captured = null;
        const res = {
            status(code) { this._code = code; return this; },
            json(body) { captured = { code: this._code, body }; return this; },
        };
        await controller.aging(req, res);
        expect(captured.code).toBe(200);
        expect(captured.body.totals.d31_60).toBe(100); // overdue invoice (59 days)
        expect(captured.body.totals.current).toBe(150); // not-yet-due, net of payment
        expect(captured.body.totals.total).toBe(250);
        // Single customer row carrying both buckets.
        const row = captured.body.customers.find((c) => c.custId === ids.customer);
        expect(row).toBeDefined();
        expect(row.total).toBe(250);
    });
});
