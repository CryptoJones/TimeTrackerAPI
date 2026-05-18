// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP smoke tests for the 5 bulk endpoints added in P3-H:
//   POST /v1/worker/bulk
//   POST /v1/billingtype/bulk
//   POST /v1/inventoryitem/bulk
//   POST /v1/inventorytransaction/bulk
//   POST /v1/purchaseordervendor/bulk
//
// All five share the direct-compId scoping pattern via
// app/controllers/_bulk-helpers.js. We exercise:
//   - the route is mounted (not 404)
//   - the auth contract (403 without authKey)
//   - the schema's outer-key validation (400 when missing / empty /
//     past the 500 cap)
//
// Transactional roll-back and master-vs-non-master scoping live in
// integration tests (gated on a real DB).

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
    Worker:              { bulkCreate: vi.fn().mockResolvedValue([]) },
    BillingType:         { bulkCreate: vi.fn().mockResolvedValue([]) },
    InventoryItem:       { bulkCreate: vi.fn().mockResolvedValue([]) },
    InventoryTransaction:{ bulkCreate: vi.fn().mockResolvedValue([]) },
    PurchaseOrderVendor: { bulkCreate: vi.fn().mockResolvedValue([]) },
    Company: {}, Job: {}, Invoice: {}, CustomerPayment: {},
    InvoiceJob: {}, ProductEntry: {}, VersionInfo: {},
    PurchaseOrderHeader: {}, PurchaseOrderLine: {}, TimeEntry: {},
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

// Each entry: [path, bodyKey, sampleEntry] — the sampleEntry must
// satisfy zod for the create schema (otherwise we can't tell a 400
// from an empty-array case from a 400 from a bad entry).
const ENTITIES = [
    [
        '/v1/worker/bulk',
        'workers',
        {
            workerFName: 'Ada', workerLName: 'Lovelace',
            workerTitle: 'Engineer', workerDefaultBillType: 1,
        },
    ],
    [
        '/v1/billingtype/bulk',
        'billingTypes',
        { btName: 'Standard', btHourlyRate: 100 },
    ],
    [
        '/v1/inventoryitem/bulk',
        'inventoryItems',
        { invitDescription: 'Widget', invitQty: 5 },
    ],
    [
        '/v1/inventorytransaction/bulk',
        'inventoryTransactions',
        { invtDirection: 1, invtInitId: 1 },
    ],
    [
        '/v1/purchaseordervendor/bulk',
        'vendors',
        { povName: 'Vendor A', povMailingAddress1: '123 Main', povMailingCity: 'Lincoln' },
    ],
];

describe('bulk endpoints: auth contract', () => {
    test.each(ENTITIES)('POST %s returns 403 when authKey header is missing', async (path, bodyKey, sample) => {
        const body = {};
        body[bodyKey] = [sample];
        const res = await request(app).post(path).send(body);
        expect(res.status).toBe(403);
    });
});

describe('bulk endpoints: body validation', () => {
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
});

describe('bulk endpoints: route mounting (not 404)', () => {
    test.each(ENTITIES)('POST %s reaches the validator/controller layer (not a missing route)', async (path, bodyKey, sample) => {
        const body = {};
        body[bodyKey] = [sample];
        const res = await request(app).post(path).set('authKey', 'any').send(body);
        expect(res.status).not.toBe(404);
    });
});
