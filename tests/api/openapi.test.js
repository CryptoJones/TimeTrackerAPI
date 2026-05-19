// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for the OpenAPI spec + Swagger UI mount.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
// body-parser dropped; express has it built-in since 4.16

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {
        findByPk: vi.fn(), findAll: vi.fn().mockResolvedValue([]),
        findAndCountAll: vi.fn().mockResolvedValue({ count: 0, rows: [] }),
        create: vi.fn(),
    },
    ApiKey: {}, ApiMaster: {},
    TimeEntry: { findByPk: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('OpenAPI spec', () => {
    test('GET /openapi.json returns the spec', async () => {
        const res = await request(app).get('/openapi.json');
        expect(res.status).toBe(200);
        expect(res.body.openapi).toMatch(/^3\./);
        expect(res.body.info.title).toBe('TimeTrackerAPI');
        expect(res.body.info.version).toBeDefined();
    });

    test('spec includes all v1 paths', async () => {
        const res = await request(app).get('/openapi.json');
        const paths = Object.keys(res.body.paths);
        expect(paths).toContain('/healthz');
        expect(paths).toContain('/v1/customer/{id}');
        expect(paths).toContain('/v1/customer/bycompany/{id}');
        expect(paths).toContain('/v1/customer');
        expect(paths).toContain('/v1/timeentry');
        expect(paths).toContain('/v1/timeentry/{id}');
        expect(paths).toContain('/v1/timeentry/bycompany/{id}');
    });

    test('spec declares the authKey security scheme', async () => {
        const res = await request(app).get('/openapi.json');
        const schemes = res.body.components.securitySchemes;
        expect(schemes.authKey).toBeDefined();
        expect(schemes.authKey.type).toBe('apiKey');
        expect(schemes.authKey.in).toBe('header');
        expect(schemes.authKey.name).toBe('authKey');
    });

    test('Customer and TimeEntry schemas are exported', async () => {
        const res = await request(app).get('/openapi.json');
        const schemas = res.body.components.schemas;
        expect(schemas.Customer).toBeDefined();
        expect(schemas.TimeEntry).toBeDefined();
        // Field spot check
        expect(schemas.Customer.properties.custId).toBeDefined();
        expect(schemas.TimeEntry.properties.teStartedAt).toBeDefined();
    });

    test('Error component schema matches the runtime shape ({message, requestId?})', async () => {
        // Pre-#334 the schema declared a free-form `error: string` field
        // that the runtime never emitted (controller-error-shape.test.js
        // pins the no-leak policy; the error-handler only ever sends
        // `{message, requestId?}`). SDK code-gen consuming the spec was
        // building clients that read a non-existent field. The replacement
        // pins the true runtime shape: required `message`, optional
        // `requestId`.
        const res = await request(app).get('/openapi.json');
        const err = res.body.components.schemas.Error;
        expect(err.type).toBe('object');
        expect(err.properties.message).toBeDefined();
        expect(err.properties.message.type).toBe('string');
        // requestId IS declared; `error` was dropped.
        expect(err.properties.requestId).toBeDefined();
        expect(err.properties.requestId.type).toBe('string');
        expect(err.properties.error).toBeUndefined();
        // message is the only required field — requestId only appears
        // when the request reached the request-id middleware.
        expect(err.required).toEqual(['message']);
    });

    test('bulkPath factory declares the {message, count, [bodyKey]} envelope across all 12 factory-driven endpoints', async () => {
        // The bulkPath() factory in app/config/openapi.js emits the
        // schema for the 12 entities that use _bulk-helpers (worker,
        // billingtype, inventoryitem, inventorytransaction,
        // purchaseordervendor, job, invoice, customerpayment,
        // invoicejob, productentry, purchaseorderheader,
        // purchaseorderline). Customer/bulk uses a hand-rolled spec
        // entry, fixed separately in #332. Pin the factory-side
        // contract once so any of the 12 endpoints regressing fails
        // CI as a group.
        const res = await request(app).get('/openapi.json');
        const targets = [
            ['/v1/worker/bulk',                'workers',              'Worker'],
            ['/v1/billingtype/bulk',           'billingTypes',         'BillingType'],
            ['/v1/inventoryitem/bulk',         'inventoryItems',       'InventoryItem'],
            ['/v1/inventorytransaction/bulk',  'inventoryTransactions','InventoryTransaction'],
            ['/v1/purchaseordervendor/bulk',   'vendors',              'PurchaseOrderVendor'],
            ['/v1/job/bulk',                   'jobs',                 'Job'],
            ['/v1/invoice/bulk',               'invoices',             'Invoice'],
            ['/v1/customerpayment/bulk',       'customerPayments',     'CustomerPayment'],
            ['/v1/invoicejob/bulk',            'invoiceJobs',          'InvoiceJob'],
            ['/v1/productentry/bulk',          'productEntries',       'ProductEntry'],
            ['/v1/purchaseorderheader/bulk',   'purchaseOrderHeaders', 'PurchaseOrderHeader'],
            ['/v1/purchaseorderline/bulk',     'purchaseOrderLines',   'PurchaseOrderLine'],
        ];
        for (const [path, bodyKey, schemaName] of targets) {
            const r201 = res.body.paths[path].post.responses['201'];
            const schema = r201.content['application/json'].schema;
            expect(schema.type, `${path} 201 should declare object`).toBe('object');
            expect(schema.properties.message).toBeDefined();
            expect(schema.properties.count.type).toBe('integer');
            expect(schema.properties[bodyKey], `${path} should declare ${bodyKey} array`).toBeDefined();
            expect(schema.properties[bodyKey].type).toBe('array');
            expect(schema.properties[bodyKey].items.$ref).toBe(`#/components/schemas/${schemaName}`);
        }
    });

    test('GET /v1/timeentry/bycompany/{id} 200 declares the {message, count, limit, offset, timeEntries} envelope', async () => {
        // Parallel to the customer/bycompany declaration in #340.
        // Pre-fix the spec said only `description: 'OK'`; SDK code-gen
        // had no way to model the pagination envelope.
        const res = await request(app).get('/openapi.json');
        const r200 = res.body.paths['/v1/timeentry/bycompany/{id}'].get.responses['200'];
        const schema = r200.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties.message.type).toBe('string');
        expect(schema.properties.count.type).toBe('integer');
        expect(schema.properties.limit.type).toBe('integer');
        expect(schema.properties.offset.type).toBe('integer');
        expect(schema.properties.timeEntries.type).toBe('array');
        expect(schema.properties.timeEntries.items.$ref).toBe('#/components/schemas/TimeEntry');
    });

    test('GET /v1/customer/bycompany/{id} 200 declares the {message, count, limit, offset, customers} envelope', async () => {
        // Paginated list endpoint — controller emits the same envelope
        // every list endpoint uses. Pre-fix the spec said only
        // `description: 'OK'`, so SDK generators couldn't model the
        // shape clients see in response to a Link-header-paginated
        // walk. Same missing-content-schema fix pattern as #316
        // (single POST) and #332 (bulk POST).
        const res = await request(app).get('/openapi.json');
        const r200 = res.body.paths['/v1/customer/bycompany/{id}'].get.responses['200'];
        const schema = r200.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties.message.type).toBe('string');
        expect(schema.properties.count.type).toBe('integer');
        expect(schema.properties.limit.type).toBe('integer');
        expect(schema.properties.offset.type).toBe('integer');
        expect(schema.properties.customers.type).toBe('array');
        expect(schema.properties.customers.items.$ref).toBe('#/components/schemas/Customer');
    });

    test('POST /v1/customer/bulk 201 declares the {message, count, customers} envelope', async () => {
        // makeBulkCreate (app/controllers/_bulk-helpers.js) emits
        // {message, count, <createdKey>}. The spec previously had
        // description + headers but no content schema, so SDK
        // code-gen modeled the response as untyped. Same drift
        // pattern as #316 / #326 but for the bulk variant.
        const res = await request(app).get('/openapi.json');
        const r201 = res.body.paths['/v1/customer/bulk'].post.responses['201'];
        const schema = r201.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties.message).toBeDefined();
        expect(schema.properties.count.type).toBe('integer');
        expect(schema.properties.customers.type).toBe('array');
        expect(schema.properties.customers.items.$ref).toBe('#/components/schemas/Customer');
    });

    test('POST /v1/timeentry 201 declares the {message, timeEntry} envelope', async () => {
        // Same envelope-drift fix as #316 (customer POST) and #312
        // (customer GET). Pre-fix the timeentry POST 201 had no
        // content schema at all, so SDK code-gen modeled the body
        // as a bare untyped 201 — strictly worse than the customer
        // case because the row inside the envelope was unreachable
        // from generated client types.
        const res = await request(app).get('/openapi.json');
        const r201 = res.body.paths['/v1/timeentry'].post.responses['201'];
        const schema = r201.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties.message).toBeDefined();
        expect(schema.properties.timeEntry.$ref).toBe('#/components/schemas/TimeEntry');
    });

    test('POST /v1/customer 201 declares the {message, customer} envelope', async () => {
        // Same envelope-drift fix as the GET endpoint below (#312)
        // but for the create path. The controller responds with
        // `{message, customer}` on a successful 201; the spec
        // previously said the body was a bare Customer, so SDK
        // generators built clients that failed to find the row.
        const res = await request(app).get('/openapi.json');
        const r201 = res.body.paths['/v1/customer'].post.responses['201'];
        const schema = r201.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties.message).toBeDefined();
        expect(schema.properties.customer.$ref).toBe('#/components/schemas/Customer');
    });

    test('GET /v1/customer/{id} 200 declares the {message, customer, customers} envelope', async () => {
        // Pre-#292 the spec said the body was a bare Customer. The
        // controller actually returns a `{message, customer, customers}`
        // envelope (the dual key is the backward-compat wart documented
        // in customercontroller.js). SDK code-gen builds the wrong type
        // unless the spec mirrors the runtime shape.
        const res = await request(app).get('/openapi.json');
        const r200 = res.body.paths['/v1/customer/{id}'].get.responses['200'];
        const schema = r200.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties.message).toBeDefined();
        expect(schema.properties.customer.$ref).toBe('#/components/schemas/Customer');
        expect(schema.properties.customers.$ref).toBe('#/components/schemas/Customer');
        // 404 is documented now too (controller short-circuits on missing rows).
        expect(r200).toBeDefined();
        expect(res.body.paths['/v1/customer/{id}'].get.responses['404']).toBeDefined();
    });

    test('VersionInfo.viVersion pins the 1..255 bound from the validator', async () => {
        // Mirrors versioninfo.schema.js. SDK generators expose viVersion
        // as `string`; without minLength/maxLength they can't catch a
        // client sending a 10k-char "version" string before the server
        // does.
        const res = await request(app).get('/openapi.json');
        const vi = res.body.components.schemas.VersionInfo;
        expect(vi.properties.viVersion.minLength).toBe(1);
        expect(vi.properties.viVersion.maxLength).toBe(255);
    });

    test('PurchaseOrderHeader pins the validator field-length bounds', async () => {
        // Mirrors purchaseorderheader.schema.js. Without these, SDK
        // generators expose pohReference/pohTerms as unbounded strings
        // and miss the server-side caps.
        const res = await request(app).get('/openapi.json');
        const poh = res.body.components.schemas.PurchaseOrderHeader;
        expect(poh.properties.pohReference.minLength).toBe(1);
        expect(poh.properties.pohReference.maxLength).toBe(255);
        expect(poh.properties.pohTerms.minLength).toBe(1);
        expect(poh.properties.pohTerms.maxLength).toBe(1000);
    });

    test('PurchaseOrderLine.polItemDesc pins the validator field-length bound', async () => {
        // Mirrors purchaseorderline.schema.js — 1..1000 chars.
        const res = await request(app).get('/openapi.json');
        const pol = res.body.components.schemas.PurchaseOrderLine;
        expect(pol.properties.polItemDesc.minLength).toBe(1);
        expect(pol.properties.polItemDesc.maxLength).toBe(1000);
    });

    test('TimeEntry.teDescription pins the 10000-char bound from the validator', async () => {
        // The zod schema (app/schemas/timeentry.schema.js) caps
        // teDescription at 10000 chars. The OpenAPI component schema
        // previously left the field unbounded, so SDK code-gen would
        // expose a `string` with no maxLength — clients couldn't tell
        // there was a server-side limit until they got a 400 back. Pin
        // the bound here so a regression on either side fails CI.
        const res = await request(app).get('/openapi.json');
        const te = res.body.components.schemas.TimeEntry;
        expect(te.properties.teDescription.type).toBe('string');
        expect(te.properties.teDescription.maxLength).toBe(10000);
    });

    test('spec documents all 13 bulk-create endpoints', async () => {
        const res = await request(app).get('/openapi.json');
        const paths = Object.keys(res.body.paths);
        const expected = [
            '/v1/customer/bulk',
            '/v1/worker/bulk',
            '/v1/billingtype/bulk',
            '/v1/inventoryitem/bulk',
            '/v1/inventorytransaction/bulk',
            '/v1/purchaseordervendor/bulk',
            '/v1/job/bulk',
            '/v1/invoice/bulk',
            '/v1/customerpayment/bulk',
            '/v1/invoicejob/bulk',
            '/v1/productentry/bulk',
            '/v1/purchaseorderheader/bulk',
            '/v1/purchaseorderline/bulk',
        ];
        for (const p of expected) {
            expect(paths, `missing OpenAPI entry for ${p}`).toContain(p);
        }
    });

    test('single-create POSTs document the Idempotency-Key header', async () => {
        // The middleware applies to every /v1/* POST, so the spec
        // should advertise the header on the single-create endpoints
        // too — not just the bulk variants. We don't pin the 409
        // response on single POSTs (the same-key-different-body case
        // is rare enough that documenting just the request header is
        // sufficient for SDK code-gen).
        const res = await request(app).get('/openapi.json');
        const targets = [
            '/v1/customer', '/v1/timeentry', '/v1/worker', '/v1/billingtype',
            '/v1/inventoryitem', '/v1/company', '/v1/job', '/v1/invoice',
            '/v1/customerpayment', '/v1/invoicejob', '/v1/productentry',
            '/v1/versioninfo', '/v1/purchaseordervendor',
            '/v1/purchaseorderheader', '/v1/purchaseorderline',
            '/v1/inventorytransaction',
        ];
        for (const path of targets) {
            const post = res.body.paths[path] && res.body.paths[path].post;
            expect(post, `${path} POST should be documented`).toBeDefined();
            const params = post.parameters || [];
            const idem = params.find((p) => p.name === 'Idempotency-Key');
            expect(idem, `${path} POST should document the Idempotency-Key header`).toBeDefined();
        }
    });

    test('bulk endpoints document the Idempotency-Key header', async () => {
        const res = await request(app).get('/openapi.json');
        const customer = res.body.paths['/v1/customer/bulk'];
        // Customer/bulk predates the factory; doesn't use the shared
        // helper, so the header may or may not be on it. Pick a route
        // we know goes through bulkPath() — Worker/bulk.
        const worker = res.body.paths['/v1/worker/bulk'];
        const params = (worker.post.parameters || []);
        const idem = params.find((p) => p.name === 'Idempotency-Key');
        expect(idem, 'worker/bulk should document the Idempotency-Key header').toBeDefined();
        expect(idem.in).toBe('header');
        expect(idem.required).toBe(false);
        // customer/bulk path is also documented (any shape).
        expect(customer.post).toBeDefined();
    });

    test('bulk endpoints declare Idempotency-Replay on the 201 response', async () => {
        // Counterpart to the request-header check above: the response
        // header is what SDK generators (openapi-typescript, etc.)
        // surface as a client-facing type. Without this declaration,
        // clients can't tell from the spec that a 201 may carry the
        // replay flag — it's only mentioned in the request header's
        // description prose.
        const res = await request(app).get('/openapi.json');
        const worker = res.body.paths['/v1/worker/bulk'];
        const r201 = worker.post.responses['201'];
        expect(r201, 'worker/bulk 201 response should be declared').toBeDefined();
        expect(r201.headers, 'worker/bulk 201 should declare response headers').toBeDefined();
        const replay = r201.headers['Idempotency-Replay'];
        expect(replay, 'Idempotency-Replay header should appear in 201 headers').toBeDefined();
        expect(replay.schema).toBeDefined();
        expect(replay.schema.enum).toContain('true');
    });

    test('customer/bulk also declares Idempotency-Replay on the 201 response', async () => {
        // Customer/bulk predates the bulkPath() factory and has its
        // own dedicated path entry in the spec. The factory got the
        // header in #168; this assertion catches the inconsistent case
        // where customer/bulk was missed.
        const res = await request(app).get('/openapi.json');
        const customer = res.body.paths['/v1/customer/bulk'];
        const r201 = customer.post.responses['201'];
        expect(r201.headers, 'customer/bulk 201 should declare response headers').toBeDefined();
        const replay = r201.headers['Idempotency-Replay'];
        expect(replay, 'Idempotency-Replay should appear on customer/bulk too').toBeDefined();
        expect(replay.schema.enum).toContain('true');
    });

    test('every single-create POST declares Idempotency-Replay on the 201', async () => {
        // Single-create POSTs flow through the same idempotency
        // middleware as the bulk endpoints. Without the response-header
        // declaration on the 201, SDKs generated from the spec can't
        // surface the replay flag for non-bulk creates.
        //
        // #245 sweep (#246–#288) ensured the declaration on every
        // entity's single-create POST. Pin all 16 here so a future
        // regression on any one of them fails CI — not just on
        // /v1/customer.
        const res = await request(app).get('/openapi.json');
        const targets = [
            '/v1/customer', '/v1/timeentry', '/v1/worker', '/v1/billingtype',
            '/v1/inventoryitem', '/v1/company', '/v1/job', '/v1/invoice',
            '/v1/customerpayment', '/v1/invoicejob', '/v1/productentry',
            '/v1/versioninfo', '/v1/purchaseordervendor',
            '/v1/purchaseorderheader', '/v1/purchaseorderline',
            '/v1/inventorytransaction',
        ];
        for (const path of targets) {
            const r201 = res.body.paths[path].post.responses['201'];
            expect(r201.headers, `${path} POST 201 should declare headers`).toBeDefined();
            const replay = r201.headers['Idempotency-Replay'];
            expect(replay, `Idempotency-Replay should appear on ${path} POST 201`).toBeDefined();
            expect(replay.schema.enum, `${path} replay schema should enum 'true'`).toContain('true');
        }
    });

    test('/metrics endpoint is documented', async () => {
        const res = await request(app).get('/openapi.json');
        const m = res.body.paths['/metrics'];
        expect(m).toBeDefined();
        expect(m.get).toBeDefined();
        expect(m.get.responses['200']).toBeDefined();
    });

    test('/healthz 503 response documents the db_error field', async () => {
        // The healthz controller (app/controllers/healthcontroller.js)
        // appends a `db_error` string field to the 503 body when the
        // SELECT 1 probe throws. Operators rely on this for debugging;
        // SDK generators read it from the spec. Pin the schema so a
        // future controller refactor that drops the field also fails
        // here and the docs stay in sync with reality.
        const res = await request(app).get('/openapi.json');
        const h = res.body.paths['/healthz'];
        const r503 = h.get.responses['503'];
        expect(r503).toBeDefined();
        const schema = r503.content
            && r503.content['application/json']
            && r503.content['application/json'].schema;
        expect(schema, '/healthz 503 should declare a body schema').toBeDefined();
        expect(schema.properties.db_error, 'db_error should appear in the 503 body').toBeDefined();
        expect(schema.properties.db_error.type).toBe('string');
    });

    test('GET /docs serves Swagger UI HTML', async () => {
        const res = await request(app).get('/docs/');
        // swagger-ui-express serves HTML; we don't pin the exact body
        // (it changes per swagger-ui release) but the content-type
        // must be HTML and the title must be present.
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('Swagger');
    });
});
