// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Integration test for POST /v1/invoice/from-job/:id (auto-bill) against
// real Postgres. Exercises the full controller path — gather billable
// time → resolve rates → create invoice + line → consume entries — which
// the api-tier mocks can't reach. Uses a real master ApiMaster row for
// auth. Auto-skips without a database.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const auth = require('../../app/middleware/auth.js');

const HAS_DB = Boolean(process.env.DB_PASSWORD);
const MASTER_KEY = `_integ_fromjob_master_${process.pid}_${Date.now()}`;

let db;
let controller;
let connected = false;
const ids = {};
let created = null; // { invId, lineId } from the endpoint

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
        amKEY: auth.hashKey(MASTER_KEY), amArchive: false,
        // amArchiveDate is NOT NULL in the schema; a sentinel is fine for
        // an active (amArchive=false) key — auth only checks amArchive.
        amArchiveDate: '2000-01-01T00:00:00Z',
    });
    ids.master = master.amId;
    const company = await db.Company.create({ compName: `${MASTER_KEY}_co`, compArch: false });
    ids.company = company.compId;
    const customer = await db.Customer.create({
        custCompId: company.compId, custCompanyName: `${MASTER_KEY}_cust`,
        custFName: 'Auto', custLName: 'Bill', custArch: false,
    });
    ids.customer = customer.custId;
    const bt = await db.BillingType.create({
        btCompId: company.compId, btName: `${MASTER_KEY}_rate`, btHourlyRate: 100, btArch: false,
    });
    ids.billtype = bt.btId;
    const job = await db.Job.create({
        jobCustId: customer.custId, jobDesc: `${MASTER_KEY}_job`, jobArch: false, jobInvoiced: false,
    });
    ids.job = job.jobId;
    // Two billable, closed, 2-hour entries at $100/hr → $400 total.
    for (let i = 0; i < 2; i++) {
        await db.TimeEntry.create({
            teCustId: customer.custId, teCompId: company.compId, teJobId: job.jobId,
            teBillTypeId: bt.btId, teBillable: true, teMinutes: 120,
            teStartedAt: '2026-01-01T09:00:00Z', teEndedAt: '2026-01-01T11:00:00Z', teArch: false,
        });
    }
}, 30000);

afterAll(async () => {
    if (!connected || !db) return;
    const q = (sql, repl) => db.sequelize.query(sql, { replacements: repl })
        .catch((e) => console.warn('[integration] cleanup failed:', e.message));
    await q('DELETE FROM "dbo"."TimeEntry" WHERE "teJobId" = ?', [ids.job]);
    if (created) {
        await q('DELETE FROM "dbo"."InvoiceJob" WHERE "injbInvId" = ?', [created.invId]);
        await q('DELETE FROM "dbo"."Invoice" WHERE "invId" = ?', [created.invId]);
    }
    await q('DELETE FROM "dbo"."Job" WHERE "jobId" = ?', [ids.job]);
    await q('DELETE FROM "dbo"."BillingType" WHERE "btId" = ?', [ids.billtype]);
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

describe.skipIf(!HAS_DB)('integration: auto-bill from job', () => {
    test('creates a $400 invoice from two 2h @ $100 entries and consumes them', async () => {
        const req = {
            get: (h) => (h === 'authKey' ? MASTER_KEY : undefined),
            params: { id: ids.job },
            body: {},
        };
        const res = fakeRes();
        await controller.createFromJob(req, res);
        expect(res._code).toBe(201);
        expect(res._body.amount).toBe(400);
        expect(res._body.billedCount).toBe(2);
        expect(res._body.unratedCount).toBe(0);
        created = { invId: res._body.invoice.invId, lineId: res._body.line.injbId };

        // Entries are now consumed (teInvoiceJobId set) → a second call has
        // nothing left to bill.
        const again = fakeRes();
        await controller.createFromJob({
            get: (h) => (h === 'authKey' ? MASTER_KEY : undefined),
            params: { id: ids.job }, body: {},
        }, again);
        expect(again._code).toBe(400);
    });
});
