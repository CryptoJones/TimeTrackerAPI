// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for the 7 indirect-scoped bulk endpoints added in P3-H2:
//   POST /v1/job/bulk                  customer-scoped
//   POST /v1/invoice/bulk              customer-scoped
//   POST /v1/customerpayment/bulk      customer-scoped
//   POST /v1/invoicejob/bulk           job-scoped
//   POST /v1/productentry/bulk         job-scoped
//   POST /v1/purchaseorderheader/bulk  vendor-scoped
//   POST /v1/purchaseorderline/bulk    header-scoped
//
// All seven share app/controllers/_bulk-helpers.js#makeBulkCreateIndirect,
// which parameterizes over the parent-FK column and the auth helper
// that resolves that FK to a company id.
//
// Coverage:
//   - auth contract (403 without authKey)
//   - schema validation: missing outer field, empty array, 501-cap,
//     unknown top-level field, missing parent FK on an entry
//   - route mounting (not 404)
//
// Per-entry parent-row-resolved-to-different-company-than-caller and
// transactional roll-back paths require the real DB and live in the
// integration suite.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        transaction: vi.fn().mockResolvedValue({
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        }),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: { Op: {} },
    Customer: {},
    Job:                 { bulkCreate: vi.fn().mockResolvedValue([]) },
    Invoice:             { bulkCreate: vi.fn().mockResolvedValue([]) },
    CustomerPayment:     { bulkCreate: vi.fn().mockResolvedValue([]) },
    InvoiceJob:          { bulkCreate: vi.fn().mockResolvedValue([]) },
    ProductEntry:        { bulkCreate: vi.fn().mockResolvedValue([]) },
    PurchaseOrderHeader: { bulkCreate: vi.fn().mockResolvedValue([]) },
    PurchaseOrderLine:   { bulkCreate: vi.fn().mockResolvedValue([]) },
    Worker: {}, BillingType: {}, InventoryItem: {}, Company: {},
    PurchaseOrderVendor: {}, InventoryTransaction: {}, TimeEntry: {},
    VersionInfo: {},
    ApiKey: {}, ApiMaster: {},
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

// path, bodyKey, sampleEntry (must satisfy createBody), parentFkField
const ENTITIES = [
    [
        '/v1/job/bulk',
        'jobs',
        { jobCustId: 5, jobDesc: 'Job A' },
        'jobCustId',
    ],
    [
        '/v1/invoice/bulk',
        'invoices',
        { invCustId: 5, invDate: '2026-05-18', invDueDate: '2026-06-18' },
        'invCustId',
    ],
    [
        '/v1/customerpayment/bulk',
        'customerPayments',
        { cpayCustId: 5, cpayDate: '2026-05-18', cpayAmount: 100 },
        'cpayCustId',
    ],
    [
        '/v1/invoicejob/bulk',
        'invoiceJobs',
        { injbInvId: 1, injbJobId: 1, injbAmount: 250 },
        'injbJobId',
    ],
    [
        '/v1/productentry/bulk',
        'productEntries',
        { pentQty: 3, pentJobId: 1, pentInvtId: 1 },
        'pentJobId',
    ],
    [
        '/v1/purchaseorderheader/bulk',
        'purchaseOrderHeaders',
        {
            pohDate: '2026-05-18T12:00:00Z',
            pohReference: 'PO-1',
            pohTerms: 'Net 30',
            pohPovId: 1,
        },
        'pohPovId',
    ],
    [
        '/v1/purchaseorderline/bulk',
        'purchaseOrderLines',
        { polpoh: 1, polItemDesc: 'Widget', polQty: 2, polPrice: 10, polInvtId: 1 },
        'polpoh',
    ],
];

describe('indirect-scoped bulk endpoints: auth contract', () => {
    test.each(ENTITIES)('POST %s returns 403 when authKey header is missing', async (path, bodyKey, sample) => {
        const body = {};
        body[bodyKey] = [sample];
        const res = await request(app).post(path).send(body);
        expect(res.status).toBe(403);
    });
});

describe('indirect-scoped bulk endpoints: body validation', () => {
    test.each(ENTITIES)('POST %s 400 when outer field is missing', async (path) => {
        const res = await request(app).post(path).set('authKey', 'any').send({});
        expect(res.status).toBe(400);
    });

    test.each(ENTITIES)('POST %s 400 when array is empty', async (path, bodyKey) => {
        const body = {};
        body[bodyKey] = [];
        const res = await request(app).post(path).set('authKey', 'any').send(body);
        expect(res.status).toBe(400);
    });

    test.each(ENTITIES)('POST %s 400 when batch exceeds 500-entry cap', async (path, bodyKey, sample) => {
        const body = {};
        body[bodyKey] = new Array(501).fill(sample);
        const res = await request(app).post(path).set('authKey', 'any').send(body);
        expect(res.status).toBe(400);
    });

    test.each(ENTITIES)('POST %s 400 when a top-level unknown field is present', async (path, bodyKey, sample) => {
        const body = {};
        body[bodyKey] = [sample];
        body.bogus = 'no';
        const res = await request(app).post(path).set('authKey', 'any').send(body);
        expect(res.status).toBe(400);
    });

    test.each(ENTITIES)('POST %s 400 when an entry omits the parent FK %s', async (path, bodyKey, sample, fkField) => {
        const entry = { ...sample };
        delete entry[fkField];
        const body = {};
        body[bodyKey] = [entry];
        const res = await request(app).post(path).set('authKey', 'any').send(body);
        // The zod schema requires the parent FK as a positive integer;
        // missing it fails at the validate layer (400) rather than at
        // the controller's per-entry check.
        expect(res.status).toBe(400);
    });
});

describe('indirect-scoped bulk endpoints: route mounting (not 404)', () => {
    test.each(ENTITIES)('POST %s reaches the validator/controller (not a missing route)', async (path, bodyKey, sample) => {
        const body = {};
        body[bodyKey] = [sample];
        const res = await request(app).post(path).set('authKey', 'any').send(body);
        expect(res.status).not.toBe(404);
    });
});
