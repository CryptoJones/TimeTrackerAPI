// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration test for GET /v1/invoice/:id/pdf against real Postgres:
// loads an invoice (with lines, payments, customer, company), renders
// it, and asserts a PDF is streamed with the right headers. Auto-skips
// without a database.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const auth = require('../../app/middleware/auth.js');

const HAS_DB = Boolean(process.env.DB_PASSWORD);
const KEY = `_integ_pdf_master_${process.pid}_${Date.now()}`;

let db;
let controller;
let connected = false;
const ids = {};

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
        custFName: 'Pee', custLName: 'Dee Eff', custArch: false,
    });
    ids.customer = customer.custId;
    const invoice = await db.Invoice.create({
        invCustId: customer.custId, invDate: '2026-01-01', invDueDate: '2026-02-01',
        invPaid: false, invStatus: 'sent', invArch: false,
    });
    ids.invoice = invoice.invId;
    await db.InvoiceJob.create({ injbInvId: invoice.invId, injbJobId: null, injbAmount: 250, injbArch: false });
    await db.CustomerPayment.create({
        cpayCustId: customer.custId, cpayInvId: invoice.invId,
        cpayAmount: 100, cpayDate: '2026-01-15', cpayArch: false,
    });
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    const q = (sql, repl) => db.sequelize.query(sql, { replacements: repl })
        .catch((e) => console.warn('[integration] cleanup failed:', e.message));
    await q('DELETE FROM "dbo"."CustomerPayment" WHERE "cpayInvId" = ?', [ids.invoice]);
    await q('DELETE FROM "dbo"."InvoiceJob" WHERE "injbInvId" = ?', [ids.invoice]);
    await q('DELETE FROM "dbo"."Invoice" WHERE "invId" = ?', [ids.invoice]);
    await q('DELETE FROM "dbo"."Customer" WHERE "custId" = ?', [ids.customer]);
    await q('DELETE FROM "dbo"."Company" WHERE "compId" = ?', [ids.company]);
    await q('DELETE FROM "dbo"."ApiMaster" WHERE "amId" = ?', [ids.master]);
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
});

function fakeRes() {
    return {
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this._code = code; return this; },
        send(body) { this._body = body; return this; },
        json(body) { this._body = body; return this; },
    };
}

describe.skipIf(!HAS_DB)('integration: invoice PDF', () => {
    test('renders a PDF with the right content type', async () => {
        const req = {
            get: (h) => (h === 'authKey' ? KEY : undefined),
            params: { id: ids.invoice },
        };
        const res = fakeRes();
        await controller.getPdf(req, res);
        expect(res._code).toBe(200);
        expect(res.headers['Content-Type']).toBe('application/pdf');
        expect(res.headers['Content-Disposition']).toMatch(/invoice-.*\.pdf/);
        expect(Buffer.isBuffer(res._body)).toBe(true);
        expect(res._body.slice(0, 5).toString('latin1')).toBe('%PDF-');
    });
});
