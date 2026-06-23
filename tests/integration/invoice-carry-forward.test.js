// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration test for POST /v1/invoice/:id/carry-forward against real
// Postgres: an invoice with a $100 line and a $40 payment ($60 balance)
// is carried forward to a new draft invoice with a single $60
// brought-forward line, linked via invBalanceForwardFrom, and the
// original is marked void. Auto-skips without a database.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const auth = require('../../app/middleware/auth.js');

const HAS_DB = Boolean(process.env.DB_PASSWORD);
const KEY = `_integ_cf_master_${process.pid}_${Date.now()}`;

let db;
let controller;
let connected = false;
const ids = {};
let newInvoiceId = null;

beforeAll(async () => {
    if (!HAS_DB) return;
    db = require('../../app/config/db.config.js');
    controller = require('../../app/controllers/invoicecontroller.js');
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
        custFName: 'Carry', custLName: 'Forward', custArch: false,
    });
    ids.customer = customer.custId;
    const job = await db.Job.create({
        jobCustId: customer.custId, jobDesc: `${KEY}_job`, jobArch: false, jobInvoiced: false,
    });
    ids.job = job.jobId;
    const invoice = await db.Invoice.create({
        invCustId: customer.custId, invDate: '2026-01-01', invDueDate: '2026-02-01',
        invPaid: false, invStatus: 'sent', invArch: false,
    });
    ids.invoice = invoice.invId;
    await db.InvoiceJob.create({
        injbInvId: invoice.invId, injbJobId: job.jobId, injbAmount: 100, injbArch: false,
    });
    await db.CustomerPayment.create({
        cpayCustId: customer.custId, cpayInvId: invoice.invId,
        cpayAmount: 40, cpayDate: '2026-01-15', cpayArch: false,
    });
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    const q = (sql, repl) => db.sequelize.query(sql, { replacements: repl })
        .catch((e) => console.warn('[integration] cleanup failed:', e.message));
    await q('DELETE FROM "dbo"."CustomerPayment" WHERE "cpayInvId" = ?', [ids.invoice]);
    await q('DELETE FROM "dbo"."InvoiceJob" WHERE "injbInvId" IN (?, ?)', [ids.invoice, newInvoiceId || -1]);
    await q('DELETE FROM "dbo"."Invoice" WHERE "invId" IN (?, ?)', [ids.invoice, newInvoiceId || -1]);
    await q('DELETE FROM "dbo"."Job" WHERE "jobId" = ?', [ids.job]);
    await q('DELETE FROM "dbo"."Customer" WHERE "custId" = ?', [ids.customer]);
    await q('DELETE FROM "dbo"."Company" WHERE "compId" = ?', [ids.company]);
    await q('DELETE FROM "dbo"."ApiMaster" WHERE "amId" = ?', [ids.master]);
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
});

function fakeRes() {
    return {
        status(code) { this._code = code; return this; },
        json(body) { this._body = body; return this; },
    };
}

describe.skipIf(!HAS_DB)('integration: carry forward an invoice balance', () => {
    test('carries the $60 balance to a new invoice and voids the original', async () => {
        const req = {
            get: (h) => (h === 'authKey' ? KEY : undefined),
            params: { id: ids.invoice }, body: {},
        };
        const res = fakeRes();
        await controller.createCarryForward(req, res);
        expect(res._code).toBe(201);
        expect(res._body.carriedBalance).toBe(60);
        expect(res._body.voidedOriginal).toBe(true);
        expect(res._body.invoice.invBalanceForwardFrom).toBe(ids.invoice);
        expect(Number(res._body.line.injbAmount)).toBe(60);
        expect(res._body.line.injbJobId == null).toBe(true);
        newInvoiceId = res._body.invoice.invId;

        // Original is now void.
        const original = await db.Invoice.findByPk(ids.invoice);
        expect(original.invStatus).toBe('void');
    });

    test('a fully-paid invoice has nothing to carry forward (400)', async () => {
        // Pay the new invoice in full, then try to carry it forward.
        await db.CustomerPayment.create({
            cpayCustId: ids.customer, cpayInvId: newInvoiceId,
            cpayAmount: 60, cpayDate: '2026-01-20', cpayArch: false,
        });
        const res = fakeRes();
        await controller.createCarryForward({
            get: (h) => (h === 'authKey' ? KEY : undefined),
            params: { id: newInvoiceId }, body: {},
        }, res);
        expect(res._code).toBe(400);
    });
});
