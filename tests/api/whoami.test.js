// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for GET /v1/whoami.
//
// Same constraint as the other API tests in this directory:
// vi.mock on db.config.js does NOT actually intercept the nested
// CJS require chain — the controller still talks to the real
// (unconfigured) Sequelize, which fails and falls through the
// try/catch to the "unknown key" branch. The recognized-key
// branches (master / scoped) need the integration suite to cover.
//
// What this file CAN verify without a working mock:
//   - the route is mounted (not 404)
//   - 403 when authKey header is missing
//   - DB-failure fallback returns the documented unknown-key shape
//   - response is always JSON with the documented top-level keys

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {}, TimeEntry: {}, Worker: {}, BillingType: {}, InventoryItem: {},
    Company: {}, Job: {}, Invoice: {}, CustomerPayment: {},
    InvoiceJob: {}, ProductEntry: {}, VersionInfo: {},
    PurchaseOrderVendor: {}, PurchaseOrderHeader: {}, PurchaseOrderLine: {},
    InventoryTransaction: {},
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

describe('GET /v1/whoami auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).get('/v1/whoami');
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Authorization key not sent/i);
    });

    test('route is mounted (handler runs, not express default 404)', async () => {
        const res = await request(app).get('/v1/whoami').set('authKey', 'anything');
        expect(res.body).toBeTypeOf('object');
        // Either the well-formed whoami shape OR an error message — both prove
        // the handler ran. Express default 404 would lack both.
        expect(
            res.body.authenticated !== undefined || res.body.message !== undefined,
        ).toBe(true);
    });
});

describe('GET /v1/whoami response shape', () => {
    test('DB-unreachable fallback returns the unknown-key shape', async () => {
        // Under test-env's broken DB, both isMaster and getCompanyId
        // hit their catch blocks and return false/-1. Controller maps
        // that to the documented "unrecognized key" response.
        const res = await request(app).get('/v1/whoami').set('authKey', 'no-such-key');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            authenticated: false,
            isMaster: false,
            companyId: null,
        });
    });

    test('response always has the documented three top-level keys', async () => {
        const res = await request(app).get('/v1/whoami').set('authKey', 'anything');
        if (res.status === 200) {
            expect(Object.keys(res.body).sort()).toEqual(
                ['authenticated', 'companyId', 'isMaster'],
            );
            expect(typeof res.body.authenticated).toBe('boolean');
            expect(typeof res.body.isMaster).toBe('boolean');
            // companyId is integer or null
            expect(
                res.body.companyId === null || Number.isInteger(res.body.companyId),
            ).toBe(true);
        }
    });
});
