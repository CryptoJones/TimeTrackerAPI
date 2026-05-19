// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * OpenAPI 3.0 specification for TimeTrackerAPI. Hand-written rather
 * than swagger-jsdoc-generated so the spec doesn't drift quietly
 * when controllers change — a missing entry here is a code review
 * concern rather than something the tooling silently lies about.
 *
 * Served at /docs (interactive Swagger UI) and /openapi.json (raw).
 */

const pkg = require('../../package.json');

const securitySchemes = {
    authKey: {
        type: 'apiKey',
        in: 'header',
        name: 'authKey',
        description:
            'API key issued by the operator. Set in the `authKey` HTTP ' +
            'header on every /v1/* request. Master keys see all companies; ' +
            'normal keys are scoped to their owning company.',
    },
};

const errorResponse = {
    type: 'object',
    properties: {
        message: { type: 'string' },
        error: { type: 'string' },
    },
    required: ['message'],
};

const customerSchema = {
    type: 'object',
    properties: {
        custId: { type: 'integer', readOnly: true },
        custCompanyName: { type: 'string', maxLength: 255 },
        custFName: { type: 'string', maxLength: 255 },
        custLName: { type: 'string', maxLength: 255 },
        custAddress1: { type: 'string', maxLength: 255 },
        custAddress2: { type: 'string', maxLength: 255 },
        custCity: { type: 'string', maxLength: 255 },
        // custState matches the DB column varchar(2) — US state codes
        // (NE, CA) + Canadian province codes (AB, BC). Pinning the
        // length here so SDK code-gen (openapi-typescript etc.) carries
        // the constraint into client types. See #265.
        custState: { type: 'string', minLength: 2, maxLength: 2 },
        custZip: { type: 'string', maxLength: 32 },
        custPhone: { type: 'string', maxLength: 64 },
        custEmail: { type: 'string', format: 'email', maxLength: 255 },
        custCompId: { type: 'integer' },
        custArch: { type: 'boolean', readOnly: true },
    },
};

const workerSchema = {
    type: 'object',
    properties: {
        workerId: { type: 'integer', readOnly: true },
        workerFName: { type: 'string' },
        workerLName: { type: 'string' },
        workerTitle: { type: 'string' },
        workerDefaultBillType: { type: 'integer' },
        workerCompId: { type: 'integer' },
        workerArch: { type: 'boolean', readOnly: true },
    },
};

const billingTypeSchema = {
    type: 'object',
    properties: {
        btId: { type: 'integer', readOnly: true },
        btName: { type: 'string' },
        btHourlyRate: { type: 'number' },
        btCompId: { type: 'integer' },
        btArch: { type: 'boolean', readOnly: true },
    },
};

const inventoryItemSchema = {
    type: 'object',
    properties: {
        invitId: { type: 'integer', readOnly: true },
        invitDescription: { type: 'string' },
        invitQty: { type: 'number' },
        invitCompId: { type: 'integer' },
        invitArch: { type: 'boolean', readOnly: true },
    },
};

const companySchema = {
    type: 'object',
    properties: {
        compId: { type: 'integer', readOnly: true },
        compName: { type: 'string' },
        compAddress1: { type: 'string' },
        compAddress2: { type: 'string' },
        compCity: { type: 'string' },
        compState: { type: 'string', maxLength: 2 },
        compZip: { type: 'string' },
        compPhone: { type: 'string' },
        compEmail: { type: 'string', format: 'email' },
        compArch: { type: 'boolean', readOnly: true },
    },
};

const jobSchema = {
    type: 'object',
    properties: {
        jobId: { type: 'integer', readOnly: true },
        jobCustId: { type: 'integer' },
        jobDesc: { type: 'string' },
        jobInvoiced: { type: 'boolean' },
        jobArch: { type: 'boolean', readOnly: true },
    },
};

const invoiceSchema = {
    type: 'object',
    properties: {
        invId: { type: 'integer', readOnly: true },
        invCustId: { type: 'integer' },
        invDate: { type: 'string', format: 'date' },
        invDueDate: { type: 'string', format: 'date' },
        invPaid: { type: 'boolean' },
        invArch: { type: 'boolean', readOnly: true },
    },
};

const customerPaymentSchema = {
    type: 'object',
    properties: {
        cpayId: { type: 'integer', readOnly: true },
        cpayCustId: { type: 'integer' },
        cpayDescription: { type: 'string' },
        cpayDate: { type: 'string', format: 'date' },
        cpayAmount: { type: 'number' },
        cpayArch: { type: 'boolean', readOnly: true },
    },
};

const invoiceJobSchema = {
    type: 'object',
    properties: {
        injbId: { type: 'integer', readOnly: true },
        injbInvId: { type: 'integer' },
        injbJobId: { type: 'integer' },
        injbAmount: { type: 'number' },
        injbArch: { type: 'boolean', readOnly: true },
    },
};

const productEntrySchema = {
    type: 'object',
    properties: {
        pentId: { type: 'integer', readOnly: true },
        pentQty: { type: 'integer' },
        pentJobId: { type: 'integer' },
        pentInvtId: { type: 'integer' },
        pentTaxable: { type: 'boolean', nullable: true },
        penArch: { type: 'boolean', readOnly: true },
    },
};

const versionInfoSchema = {
    type: 'object',
    properties: {
        viId: { type: 'integer', readOnly: true },
        viVersion: { type: 'string' },
        viDate: { type: 'string', format: 'date-time' },
    },
};

const inventoryTransactionSchema = {
    type: 'object',
    properties: {
        invtId: { type: 'integer', readOnly: true },
        invtCompanyId: { type: 'integer' },
        invtDirection: { type: 'integer', enum: [0, 1], description: '0 = inbound (received), 1 = outbound (consumed)' },
        invtInitId: { type: 'integer', description: 'Inventory item this transaction affects (FK → InventoryItem.invitId)' },
        invtArch: { type: 'boolean', readOnly: true },
    },
};

const purchaseOrderHeaderSchema = {
    type: 'object',
    properties: {
        pohId: { type: 'integer', readOnly: true },
        pohDate: { type: 'string', format: 'date-time' },
        pohReference: { type: 'string' },
        pohTerms: { type: 'string' },
        pohPovId: { type: 'integer' },
        pohArch: { type: 'boolean', readOnly: true },
    },
};

const purchaseOrderLineSchema = {
    type: 'object',
    properties: {
        polId: { type: 'integer', readOnly: true },
        polpoh: { type: 'integer' },
        polItemDesc: { type: 'string' },
        polQty: { type: 'number' },
        polPrice: { type: 'number' },
        polInvtId: { type: 'integer' },
        polArch: { type: 'boolean', readOnly: true },
    },
};

const purchaseOrderVendorSchema = {
    type: 'object',
    properties: {
        povId: { type: 'integer', readOnly: true },
        povName: { type: 'string' },
        povMailingAddress1: { type: 'string' },
        povMailingAddress2: { type: 'string' },
        povMailingCity: { type: 'string' },
        povMailingState: { type: 'string' },
        povMailingCountry: { type: 'string' },
        povMailingZip: { type: 'string' },
        povBillingAddress1: { type: 'string' },
        povBillingAddress2: { type: 'string' },
        povBillingCity: { type: 'string' },
        povBillingState: { type: 'string' },
        povBillingCountry: { type: 'string' },
        povBillingZip: { type: 'string' },
        povPhone: { type: 'string' },
        povEMail: { type: 'string', format: 'email' },
        povCompId: { type: 'integer' },
        povArch: { type: 'boolean', readOnly: true },
    },
};

const timeEntrySchema = {
    type: 'object',
    properties: {
        teId: { type: 'integer', readOnly: true },
        teCustId: { type: 'integer' },
        teCompId: { type: 'integer', readOnly: true },
        teDescription: { type: 'string' },
        teStartedAt: { type: 'string', format: 'date-time' },
        teEndedAt: { type: 'string', format: 'date-time', nullable: true },
        teMinutes: { type: 'integer', nullable: true, readOnly: true },
        teBillable: { type: 'boolean', default: true },
        teArch: { type: 'boolean', readOnly: true },
    },
};

/**
 * Reusable parameter spec for the `Idempotency-Key` header.
 * Tagged onto every POST that opts into the dedup layer.
 */
const idempotencyKeyHeader = {
    name: 'Idempotency-Key',
    in: 'header',
    required: false,
    description:
        'Client-chosen string (printable ASCII, 1-255 chars) that pins a ' +
        'POST as idempotent for 24h. First success is cached; replays of ' +
        'the same key + body return the cached response with ' +
        '`Idempotency-Replay: true`. Replays of the same key with a ' +
        'DIFFERENT body return 409 to flag the misuse.',
    schema: { type: 'string', minLength: 1, maxLength: 255 },
};

/**
 * Reusable response-header spec for `Idempotency-Replay: true`.
 *
 * Set by the idempotency middleware (see app/middleware/idempotency.js)
 * whenever a cached response is replayed for a matching key + body.
 * Documented inline in the request-header description above, but the
 * response-header declaration is what SDK generators (openapi-typescript,
 * etc.) actually surface to client typings. Reference this from every
 * 200/201 response that flows through the idempotency layer so clients
 * can branch on "first write" vs. "replay" without re-parsing the body.
 */
const idempotencyReplayResponseHeader = {
    'Idempotency-Replay': {
        description:
            'Present with value `true` when the response is a replay from the ' +
            'idempotency cache. Absent on first-time writes. Useful for client- ' +
            'side write counters and observability dashboards.',
        schema: { type: 'string', enum: ['true'] },
    },
};

/**
 * OpenAPI path entry for a bulk-create endpoint. Every bulk route
 * shares the same shape — outer JSON key wraps an array of the
 * underlying entity create body, capped at 500 entries, with the
 * transactional all-or-nothing semantics documented inline. We
 * factor this so the 13 bulk entries don't drift into 13 hand-
 * maintained near-duplicates.
 */
function bulkPath(bodyKey, schemaName) {
    return {
        post: {
            summary: `Bulk-create ${bodyKey} (transaction-wrapped, all-or-nothing)`,
            description:
                `Body: \`{ ${bodyKey}: [{...}, ...] }\`. Each entry follows the ` +
                `same shape as the single-create endpoint. Capped at 500 entries; ` +
                `ETL jobs should chunk. If any entry fails to insert, the whole ` +
                `transaction rolls back — partial success is never observable.`,
            security: [{ authKey: [] }],
            parameters: [idempotencyKeyHeader],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                [bodyKey]: {
                                    type: 'array',
                                    minItems: 1,
                                    maxItems: 500,
                                    items: { $ref: `#/components/schemas/${schemaName}` },
                                },
                            },
                            required: [bodyKey],
                        },
                    },
                },
            },
            responses: {
                201: {
                    description: 'All entries created (or a replay of a previously-cached create)',
                    headers: idempotencyReplayResponseHeader,
                },
                400: { description: 'Validation failure (array empty/capped, missing parent FK, master without scope)' },
                403: { description: 'Missing authKey or cross-tenant create attempt' },
                409: { description: 'Idempotency-Key reused with a different body' },
                500: { description: 'Transaction rolled back due to DB error' },
            },
        },
    };
}

const spec = {
    openapi: '3.0.3',
    info: {
        title: 'TimeTrackerAPI',
        version: pkg.version || '1.0.0',
        description:
            'Open-source Node.js + PostgreSQL TimeTrackerAPI. Customer and ' +
            'time-entry records, scoped by company via an `authKey` header. ' +
            'Source: https://github.com/CryptoJones/TimeTrackerAPI / ' +
            'https://codeberg.org/CryptoJones/TimeTrackerAPI.',
        license: {
            name: 'Apache 2.0',
            url: 'https://www.apache.org/licenses/LICENSE-2.0',
        },
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Local dev' },
        { url: 'http://node.timetrackerapi.com', description: 'Reference deployment' },
    ],
    components: {
        securitySchemes,
        schemas: {
            Customer: customerSchema,
            TimeEntry: timeEntrySchema,
            Worker: workerSchema,
            BillingType: billingTypeSchema,
            InventoryItem: inventoryItemSchema,
            Company: companySchema,
            Job: jobSchema,
            Invoice: invoiceSchema,
            CustomerPayment: customerPaymentSchema,
            InvoiceJob: invoiceJobSchema,
            ProductEntry: productEntrySchema,
            VersionInfo: versionInfoSchema,
            PurchaseOrderVendor: purchaseOrderVendorSchema,
            PurchaseOrderHeader: purchaseOrderHeaderSchema,
            PurchaseOrderLine: purchaseOrderLineSchema,
            InventoryTransaction: inventoryTransactionSchema,
            Error: errorResponse,
        },
    },
    paths: {
        '/healthz': {
            get: {
                summary: 'Liveness + DB readiness probe',
                description: 'No auth required. Used by orchestrators (Docker, k8s, uptime monitors).',
                responses: {
                    200: {
                        description: 'OK — DB ping succeeded',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', enum: ['ok'] },
                                        db: { type: 'string', enum: ['ok'] },
                                        uptime_s: { type: 'integer' },
                                        version: { type: 'string' },
                                        elapsed_ms: { type: 'number' },
                                        migration: {
                                            type: 'string',
                                            nullable: true,
                                            description: 'Last applied migration name from SequelizeMeta (lex-highest entry, which matches apply order since filenames are timestamp-prefixed). Null when SequelizeMeta is missing or unreadable.',
                                        },
                                    },
                                },
                            },
                        },
                    },
                    503: {
                        description: 'Degraded — DB unreachable',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', enum: ['degraded'] },
                                        db: { type: 'string', enum: ['down'] },
                                        uptime_s: { type: 'integer' },
                                        version: { type: 'string' },
                                        elapsed_ms: { type: 'number' },
                                        migration: { type: 'string', nullable: true },
                                        db_error: {
                                            type: 'string',
                                            description: 'The underlying DB connection error message (e.g. "ECONNREFUSED 127.0.0.1:5432"). Useful for operator debugging; never includes credentials. Present only on the 503 path.',
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/v1/whoami': {
            get: {
                summary: 'Identity probe — what does the calling authKey resolve to?',
                description: 'Returns whether the supplied authKey is recognized, ' +
                    'whether it is a master key, and which company it is scoped to. ' +
                    'Useful for SDK clients confirming wiring without firing a ' +
                    'domain endpoint and inferring from a 403/200.',
                security: [{ authKey: [] }],
                responses: {
                    200: {
                        description: 'OK — body indicates whether the key is recognized',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        authenticated: { type: 'boolean' },
                                        isMaster: { type: 'boolean' },
                                        companyId: { type: 'integer', nullable: true },
                                    },
                                    required: ['authenticated', 'isMaster', 'companyId'],
                                },
                            },
                        },
                    },
                    403: { description: 'authKey header missing entirely' },
                    500: { description: 'Server error (DB lookup failed)' },
                },
            },
        },
        '/v1/customer/export.csv': {
            get: {
                summary: 'CSV export of customers in a company',
                description:
                    'text/csv response (no JSON envelope), `Content-Disposition: attachment` set ' +
                    'so browsers download as `customers-company-<id>.csv`. Capped at 5000 rows per ' +
                    'call; an oversize result appends a `# truncated...` comment row so callers know ' +
                    'to page via offset.',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 5000, maximum: 5000 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: {
                        description: 'CSV body',
                        content: { 'text/csv': { schema: { type: 'string' } } },
                    },
                    400: { description: 'Master without companyId' },
                    403: { description: 'Missing authKey, or cross-tenant export attempt' },
                },
            },
        },
        '/v1/customer/bulk': {
            post: {
                summary: 'Bulk-create customers (transaction-wrapped, all-or-nothing)',
                description:
                    'Body: `{ customers: [{...}, ...] }`. Each entry follows the ' +
                    'same shape as POST /v1/customer. Capped at 500 entries; ' +
                    'ETL jobs should chunk. If any entry fails to insert the ' +
                    'whole transaction rolls back.',
                security: [{ authKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    customers: {
                                        type: 'array',
                                        minItems: 1,
                                        maxItems: 500,
                                        items: { $ref: '#/components/schemas/Customer' },
                                    },
                                },
                                required: ['customers'],
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: 'All customers created (or a replay of a previously-cached create)',
                        // Customer/bulk predates the bulkPath() factory but
                        // shares the same Idempotency-Key middleware path.
                        // Declare the replay header here too so SDK generators
                        // see it on all 13 bulk endpoints, not 12-of-13.
                        // Matches the factory output from #168.
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Validation failure (array empty / master without custCompId on some entry)' },
                    403: { description: 'Missing authKey or cross-tenant create attempt' },
                    500: { description: 'Transaction rolled back due to DB error' },
                },
            },
        },
        '/v1/customer/search': {
            get: {
                summary: 'Search customers by substring (company-scoped)',
                description:
                    'Case-insensitive ILIKE match on custCompanyName / custFName / custLName. ' +
                    'Non-master keys are auto-scoped to their authKey company; master keys ' +
                    'must pass companyId explicitly (no global cross-tenant search).',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2, maxLength: 255 } },
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys. Forbidden when it does not match a non-master authKey\'s own company.' },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: {
                        description: 'OK — search results',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        q: { type: 'string' },
                                        companyId: { type: 'integer' },
                                        count: { type: 'integer' },
                                        limit: { type: 'integer' },
                                        offset: { type: 'integer' },
                                        customers: {
                                            type: 'array',
                                            items: { $ref: '#/components/schemas/Customer' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    400: { description: 'Bad request — q missing/too short, or master without companyId' },
                    403: { description: 'Missing authKey, or cross-tenant search attempt' },
                },
            },
        },
        '/v1/customer/{id}': {
            get: {
                summary: 'Get one customer by id',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                ],
                responses: {
                    200: { description: 'Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
                    403: { description: 'Missing or invalid authKey', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/v1/customer/bycompany/{id}': {
            get: {
                summary: 'List customers in a company (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: { description: 'OK' },
                    403: { description: 'Missing or invalid authKey' },
                },
            },
        },
        '/v1/customer': {
            post: {
                summary: 'Create a customer',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Customer' } },
                    },
                },
                responses: {
                    201: {
                        description: 'Created (or a replay of a previously-cached create)',
                        // The single-create POST flows through the same
                        // idempotency middleware as the bulk endpoints
                        // (see #168 and #240), so it emits the same
                        // Idempotency-Replay: true on a cached replay.
                        // Declare it so SDK generators surface the field
                        // on the client side.
                        headers: idempotencyReplayResponseHeader,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } },
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Missing or invalid authKey' },
                },
            },
        },
        '/v1/timeentry': {
            post: {
                summary: 'Create a time entry',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/TimeEntry' } },
                    },
                },
                responses: {
                    201: {
                        description: 'Created (or a replay of a previously-cached create)',
                        // Same Idempotency-Key middleware path as /v1/customer
                        // (#246) and the 13 bulk endpoints (#168 / #240).
                        // Declare the replay header so SDK generators surface
                        // the field on single-create writes.
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Bad request — missing teCustId or teStartedAt' },
                    403: { description: 'Missing or invalid authKey' },
                },
            },
        },
        '/v1/timeentry/{id}': {
            get: {
                summary: 'Get one time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            patch: {
                summary: 'Partial update of a time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TimeEntry' } } } },
                responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            delete: {
                summary: 'Soft-delete a time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/timeentry/export.csv': {
            get: {
                summary: 'CSV export of time entries (invoicing-friendly)',
                description:
                    'text/csv response with attachment Content-Disposition. ' +
                    'Same filter set as bycompany (customerId, from, to) plus a ' +
                    'master-only `companyId` requirement. 5000-row hard cap; ' +
                    'oversize results append `# truncated…` comment row.',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 5000, maximum: 5000 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: { description: 'CSV body', content: { 'text/csv': { schema: { type: 'string' } } } },
                    400: { description: 'Master without companyId' },
                    403: { description: 'Missing authKey or cross-tenant export attempt' },
                },
            },
        },
        '/v1/timeentry/bycompany/{id}': {
            get: {
                summary: 'List time entries for a company',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid company id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/worker': {
            post: {
                summary: 'Create a worker',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Worker' } },
                    },
                },
                responses: {
                    201: {
                        description: 'Created (or a replay of a previously-cached create)',
                        headers: idempotencyReplayResponseHeader,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Worker' } } },
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Missing or invalid authKey' },
                },
            },
        },
        '/v1/worker/{id}': {
            get: {
                summary: 'Get one worker',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            patch: {
                summary: 'Partial update of a worker',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Worker' } } } },
                responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            delete: {
                summary: 'Soft-delete a worker',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/worker/bycompany/{id}': {
            get: {
                summary: 'List workers in a company (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid company id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/billingtype': {
            post: {
                summary: 'Create a billing type',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BillingType' } } } },
                responses: {
                    201: {
                        description: 'Created (or a replay of a previously-cached create)',
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/billingtype/{id}': {
            get: {
                summary: 'Get one billing type',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            patch: {
                summary: 'Partial update of a billing type',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/BillingType' } } } },
                responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            delete: {
                summary: 'Soft-delete a billing type',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/billingtype/bycompany/{id}': {
            get: {
                summary: 'List billing types in a company (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid company id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/inventoryitem': {
            post: {
                summary: 'Create an inventory item',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InventoryItem' } } } },
                responses: {
                    201: {
                        description: 'Created',
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/inventoryitem/{id}': {
            get: {
                summary: 'Get one inventory item',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            patch: {
                summary: 'Partial update of an inventory item',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/InventoryItem' } } } },
                responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            delete: {
                summary: 'Soft-delete an inventory item',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/inventoryitem/bycompany/{id}': {
            get: {
                summary: 'List inventory items in a company (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid company id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/company': {
            post: {
                summary: 'Create a company (master keys only)',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Company' } } } },
                responses: {
                    201: {
                        description: 'Created',
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Non-master key' },
                },
            },
            get: {
                summary: 'List all companies (master keys only, paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 403: { description: 'Non-master key' } },
            },
        },
        '/v1/company/{id}': {
            get: {
                summary: 'Get one company (master: any; non-master: own only)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            patch: {
                summary: 'Partial update of a company (master: any; non-master: own only)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Company' } } } },
                responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            delete: {
                summary: 'Soft-delete a company (master keys only)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Non-master key' } },
            },
        },
        '/v1/job': {
            post: {
                summary: 'Create a job',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
                responses: {
                    201: {
                        description: 'Created',
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/job/{id}': {
            get: { summary: 'Get one job', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of a job', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete a job', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/job/bycustomer/{id}': {
            get: {
                summary: 'List jobs for a customer (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid customer id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/invoice': {
            post: {
                summary: 'Create an invoice',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } },
                responses: {
                    201: {
                        description: 'Created',
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/invoice/{id}': {
            get: { summary: 'Get one invoice', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of an invoice', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete an invoice', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/invoice/bycustomer/{id}': {
            get: {
                summary: 'List invoices for a customer (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid customer id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/customerpayment': {
            post: {
                summary: 'Create a customer payment',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerPayment' } } } },
                responses: {
                    201: {
                        description: 'Created',
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'Bad request' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/customerpayment/{id}': {
            get: { summary: 'Get one customer payment', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of a customer payment', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerPayment' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete a customer payment', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/customerpayment/bycustomer/{id}': {
            get: {
                summary: 'List customer payments for a customer (paginated, newest first)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid customer id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/invoicejob': {
            post: {
                summary: 'Create an invoice line (job → invoice)',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InvoiceJob' } } } },
                responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/invoicejob/{id}': {
            get: { summary: 'Get one invoice line', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of an invoice line', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/InvoiceJob' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete an invoice line', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/invoicejob/byinvoice/{id}': {
            get: {
                summary: 'List invoice lines for an invoice (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid invoice id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/productentry': {
            post: {
                summary: 'Create a product entry',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductEntry' } } } },
                responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/productentry/{id}': {
            get: { summary: 'Get one product entry', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of a product entry', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductEntry' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete a product entry', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/productentry/byjob/{id}': {
            get: {
                summary: 'List product entries for a job (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid job id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/versioninfo': {
            post: {
                summary: 'Create a version info record (master keys only)',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/VersionInfo' } } } },
                responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 403: { description: 'Non-master key' } },
            },
            get: {
                summary: 'List version info (any authKey)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 403: { description: 'Missing authKey' } },
            },
        },
        '/v1/versioninfo/{id}': {
            get: { summary: 'Get one version info (any authKey)', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Missing authKey' } } },
            patch: { summary: 'Partial update of a version info (master keys only)', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/VersionInfo' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Non-master key' } } },
            delete: { summary: 'Hard-delete a version info (master keys only — no archive column on this table)', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' }, 403: { description: 'Non-master key' } } },
        },
        '/v1/purchaseordervendor': {
            post: {
                summary: 'Create a PO vendor',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderVendor' } } } },
                responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/purchaseordervendor/{id}': {
            get: { summary: 'Get one PO vendor', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of a PO vendor', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderVendor' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete a PO vendor', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/purchaseordervendor/bycompany/{id}': {
            get: {
                summary: 'List PO vendors in a company (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid company id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/purchaseorderheader': {
            post: { summary: 'Create a PO header', security: [{ authKey: [] }], parameters: [idempotencyKeyHeader], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderHeader' } } } }, responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/purchaseorderheader/{id}': {
            get: { summary: 'Get one PO header', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of a PO header', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderHeader' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete a PO header', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/purchaseorderheader/byvendor/{id}': {
            get: {
                summary: 'List PO headers for a vendor (paginated, newest first)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid vendor id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/purchaseorderline': {
            post: { summary: 'Create a PO line', security: [{ authKey: [] }], parameters: [idempotencyKeyHeader], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderLine' } } } }, responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/purchaseorderline/{id}': {
            get: { summary: 'Get one PO line', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of a PO line', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderLine' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete a PO line', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/purchaseorderline/byheader/{id}': {
            get: {
                summary: 'List PO lines for a header (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid header id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/inventorytransaction': {
            post: { summary: 'Create an inventory transaction', security: [{ authKey: [] }], parameters: [idempotencyKeyHeader], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InventoryTransaction' } } } }, responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/inventorytransaction/{id}': {
            get: { summary: 'Get one inventory transaction', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of an inventory transaction (unusual — reversing entries are the production pattern)', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/InventoryTransaction' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete an inventory transaction', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/inventorytransaction/bycompany/{id}': {
            get: {
                summary: 'List inventory transactions in a company (paginated, newest first)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid company id' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/worker/bulk':              bulkPath('workers',             'Worker'),
        '/v1/billingtype/bulk':         bulkPath('billingTypes',        'BillingType'),
        '/v1/inventoryitem/bulk':       bulkPath('inventoryItems',      'InventoryItem'),
        '/v1/inventorytransaction/bulk':bulkPath('inventoryTransactions','InventoryTransaction'),
        '/v1/purchaseordervendor/bulk': bulkPath('vendors',             'PurchaseOrderVendor'),
        '/v1/job/bulk':                 bulkPath('jobs',                'Job'),
        '/v1/invoice/bulk':             bulkPath('invoices',            'Invoice'),
        '/v1/customerpayment/bulk':     bulkPath('customerPayments',    'CustomerPayment'),
        '/v1/invoicejob/bulk':          bulkPath('invoiceJobs',         'InvoiceJob'),
        '/v1/productentry/bulk':        bulkPath('productEntries',      'ProductEntry'),
        '/v1/purchaseorderheader/bulk': bulkPath('purchaseOrderHeaders','PurchaseOrderHeader'),
        '/v1/purchaseorderline/bulk':   bulkPath('purchaseOrderLines',  'PurchaseOrderLine'),
        '/metrics': {
            get: {
                summary: 'Prometheus scrape endpoint',
                description:
                    'Returns prom-client text-format metrics: default Node.js series ' +
                    '(event-loop, heap, GC) plus per-request `http_requests_total` and ' +
                    '`http_request_duration_seconds`. Route labels use the Express route ' +
                    'pattern (e.g. `/v1/customer/:id`) so cardinality stays bounded. ' +
                    'Authentication is OPTIONAL: leave `METRICS_BEARER_TOKEN` env unset ' +
                    'for an open scrape (the usual private-network deployment), or set ' +
                    'it to require `Authorization: Bearer <token>` on the scrape.',
                responses: {
                    200: {
                        description: 'OK — Prometheus text-format metrics',
                        content: { 'text/plain': { schema: { type: 'string' } } },
                    },
                    401: { description: 'Bearer token required (when METRICS_BEARER_TOKEN is set) and missing/invalid' },
                },
            },
        },
    },
};

module.exports = spec;
