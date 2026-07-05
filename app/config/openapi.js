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
    // Shape emitted by the global error handler
    // (app/middleware/error-handler.js) and every controller's 4xx /
    // 5xx exit: a `message` string plus an optional `requestId` for
    // log correlation. The `error` field declared here previously
    // never appeared at runtime — the handler deliberately suppresses
    // raw error detail (see tests/unit/controller-error-shape.test.js
    // for the policy) so SDK code-gen that consumed this schema was
    // building clients with a field that never landed.
    properties: {
        message: { type: 'string' },
        requestId: {
            type: 'string',
            description: 'UUID correlator (same value as the X-Request-Id response header); only present when the request reached the request-id middleware.',
        },
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
        // Lengths mirror worker.schema.js's zod validators
        // (min(1).max(255) on the three name fields). Pinning them
        // here lets openapi-typescript et al. carry the bounds into
        // client-side types. Same pattern as Customer (#270) and
        // Company (#272).
        workerFName: { type: 'string', minLength: 1, maxLength: 255 },
        workerLName: { type: 'string', minLength: 1, maxLength: 255 },
        workerTitle: { type: 'string', minLength: 1, maxLength: 255 },
        workerDefaultBillType: { type: 'integer' },
        workerCompId: { type: 'integer' },
        workerArch: { type: 'boolean', readOnly: true },
    },
};

const billingTypeSchema = {
    type: 'object',
    properties: {
        btId: { type: 'integer', readOnly: true },
        // Mirror billingtype.schema.js: min(1).max(255) on btName,
        // finite + non-negative on btHourlyRate. Pinning the bounds
        // here lets SDK generators (openapi-typescript et al.) carry
        // the constraints into client types. Same pattern as Customer
        // (#270), Company (#272), Worker (#276).
        btName: { type: 'string', minLength: 1, maxLength: 255 },
        btHourlyRate: { type: 'number', minimum: 0 },
        btCompId: { type: 'integer' },
        btArch: { type: 'boolean', readOnly: true },
    },
};

const inventoryItemSchema = {
    type: 'object',
    properties: {
        invitId: { type: 'integer', readOnly: true },
        // Mirror inventoryitem.schema.js: min(1).max(1000) on
        // invitDescription, finite on invitQty. Same pattern as the
        // other entity component-schema pinning PRs.
        invitDescription: { type: 'string', minLength: 1, maxLength: 1000 },
        invitQty: { type: 'number' },
        invitCompId: { type: 'integer' },
        invitArch: { type: 'boolean', readOnly: true },
    },
};

const companySchema = {
    type: 'object',
    properties: {
        compId: { type: 'integer', readOnly: true },
        // Field-length constraints mirror the zod validators in
        // company.schema.js and the DB column widths in
        // setup/TimeTracker.sql. Surfacing them here lets SDK
        // generators (openapi-typescript et al.) carry the bounds
        // into client-side types. Customer got the same treatment
        // in #270.
        compName: { type: 'string', minLength: 1, maxLength: 255 },
        compAddress1: { type: 'string', maxLength: 255 },
        compAddress2: { type: 'string', maxLength: 255 },
        compCity: { type: 'string', maxLength: 255 },
        compState: { type: 'string', minLength: 2, maxLength: 2 },
        compZip: { type: 'string', maxLength: 32 },
        compPhone: { type: 'string', maxLength: 32 },
        compEmail: { type: 'string', format: 'email', maxLength: 255 },
        compArch: { type: 'boolean', readOnly: true },
    },
};

const jobSchema = {
    type: 'object',
    properties: {
        jobId: { type: 'integer', readOnly: true },
        jobCustId: { type: 'integer' },
        // jobDesc mirrors job.schema.js: z.string().min(1).max(10000).
        // 10000 chars is the same generous limit used for other
        // free-text fields (teDescription, polItemDesc) — big enough
        // for a paragraph or two without enabling unbounded payloads.
        jobDesc: { type: 'string', minLength: 1, maxLength: 10000 },
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
        // customerpayment.schema.js: cpayDescription is optional and
        // capped at 10000 chars (the same ceiling used for other free-
        // text fields). Pinning maxLength here matches the validator.
        cpayDescription: { type: 'string', maxLength: 10000 },
        cpayDate: { type: 'string', format: 'date' },
        // cpayAmount must be finite + non-zero (a $0 ledger entry is
        // operator error). The non-zero rule isn't expressible in
        // OpenAPI's standard vocabulary, but operators can read the
        // zod source for the full contract.
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
        // viVersion mirrors versioninfo.schema.js: 1..255 chars. SemVer
        // is much shorter than 255 in practice, but the cap matches
        // every other free-text "name/identifier" column in the API
        // for consistency.
        viVersion: { type: 'string', minLength: 1, maxLength: 255 },
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
        // Lengths mirror purchaseorderheader.schema.js: pohReference is
        // 1-255 chars, pohTerms is 1-1000 chars (the longer cap suits
        // free-text "net 30, late fees per §2.3, …" payment-terms
        // strings).
        pohReference: { type: 'string', minLength: 1, maxLength: 255 },
        pohTerms: { type: 'string', minLength: 1, maxLength: 1000 },
        pohPovId: { type: 'integer' },
        pohArch: { type: 'boolean', readOnly: true },
    },
};

const purchaseOrderLineSchema = {
    type: 'object',
    properties: {
        polId: { type: 'integer', readOnly: true },
        polpoh: { type: 'integer' },
        // Mirrors purchaseorderline.schema.js: 1-1000 chars. Same
        // free-text rationale as pohTerms above — line items often
        // carry SKU + brief description on one line.
        polItemDesc: { type: 'string', minLength: 1, maxLength: 1000 },
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
        // Lengths mirror purchaseordervendor.schema.js. The three
        // NOT-NULL columns (povName, povMailingAddress1, povMailingCity)
        // get minLength: 1; everything else is unbounded-but-capped
        // per zod. Same pattern as Customer (#270), Company (#272),
        // Worker (#276), BillingType+InventoryItem (#290), Job (#294),
        // CustomerPayment (#296).
        povName: { type: 'string', minLength: 1, maxLength: 255 },
        povMailingAddress1: { type: 'string', minLength: 1, maxLength: 255 },
        povMailingAddress2: { type: 'string', maxLength: 255 },
        povMailingCity: { type: 'string', minLength: 1, maxLength: 255 },
        povMailingState: { type: 'string', maxLength: 255 },
        povMailingCountry: { type: 'string', maxLength: 255 },
        povMailingZip: { type: 'string', maxLength: 32 },
        povBillingAddress1: { type: 'string', maxLength: 255 },
        povBillingAddress2: { type: 'string', maxLength: 255 },
        povBillingCity: { type: 'string', maxLength: 255 },
        povBillingState: { type: 'string', maxLength: 255 },
        povBillingCountry: { type: 'string', maxLength: 255 },
        povBillingZip: { type: 'string', maxLength: 32 },
        povPhone: { type: 'string', maxLength: 64 },
        povEMail: { type: 'string', format: 'email', maxLength: 255 },
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
        teDescription: { type: 'string', maxLength: 10000 },
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
                    // Controller (`_bulk-helpers.makeBulkCreate` /
                    // `makeBulkCreateIndirect`) emits {message, count,
                    // [bodyKey]: <created rows>}. Same envelope every
                    // bulk endpoint uses — the convention is that the
                    // response's array key matches the request's
                    // bodyKey. Declaring the shape here means all 12
                    // factory-driven bulk endpoints get the content
                    // schema in one place, parallel to the
                    // customer/bulk fix in #332.
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    message: { type: 'string' },
                                    count: { type: 'integer' },
                                    [bodyKey]: {
                                        type: 'array',
                                        items: { $ref: `#/components/schemas/${schemaName}` },
                                    },
                                },
                            },
                        },
                    },
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
            'Open-source Node.js + PostgreSQL TimeTrackerAPI. 16 ' +
            'company-scoped entities (Customer, TimeEntry, Worker, ' +
            'BillingType, InventoryItem, Company, Job, Invoice, ' +
            'CustomerPayment, InvoiceJob, ProductEntry, VersionInfo, ' +
            'PurchaseOrderVendor, PurchaseOrderHeader, ' +
            'PurchaseOrderLine, InventoryTransaction), Stripe-style ' +
            'idempotency on every POST, RFC 5988 Link-header ' +
            'pagination, Prometheus `/metrics`, CSV export with OWASP ' +
            'formula-injection mitigation. Auth via `authKey` header. ' +
            'Source: https://github.com/CryptoJones/TimeTrackerAPI / ' +
            'https://codeberg.org/CryptoJones/TimeTrackerAPI.',
        // Security-vulnerability reports route through the
        // private channels in SECURITY.md — link surfaces in
        // Swagger UI's info panel so docs consumers can find the
        // policy without leaving the spec.
        contact: {
            name: 'Security policy (private vuln reports)',
            url: 'https://github.com/CryptoJones/TimeTrackerAPI/security/policy',
        },
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
                        // Controller (`_bulk-helpers.makeBulkCreate`) emits
                        // `{message, count, customers}` on success. The spec
                        // previously left the body unspecified — same drift
                        // pattern fixed for single-create POST endpoints in
                        // #316 (customer) and #326 (timeentry). Pin the
                        // envelope here so SDK code-gen models the response.
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        count: { type: 'integer' },
                                        customers: {
                                            type: 'array',
                                            items: { $ref: '#/components/schemas/Customer' },
                                        },
                                    },
                                },
                            },
                        },
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
                    // The controller wraps the row in a `{message, customer,
                    // customers}` envelope. The historical `customers`
                    // (plural) key stays for backward compat; the singular
                    // `customer` was added in #292 to match the
                    // singular-for-single-row shape every other entity
                    // GET uses. Surface both in the spec so SDK
                    // generators can reach either field — the previous
                    // `$ref: Customer` declaration was misleading
                    // (the body is the envelope, not the raw row).
                    200: {
                        description: 'Found — wraps the row in a {message, customer, customers} envelope.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        customer: { $ref: '#/components/schemas/Customer' },
                                        customers: { $ref: '#/components/schemas/Customer' },
                                    },
                                },
                            },
                        },
                    },
                    403: { description: 'Missing or invalid authKey', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
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
                    200: {
                        description: 'OK — paginated customer list',
                        // Controller wraps the rows in a {message, count,
                        // limit, offset, customers} envelope. Same
                        // missing-content-schema pattern fixed for the
                        // single GET in #312 and the bulk POST in #332 —
                        // now also for the paginated list. Without the
                        // declaration, SDK generators can't model the
                        // Link-header-paired pagination envelope.
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
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
                        // Controller wraps the row in {message, customer} —
                        // same envelope pattern fixed for GET in #312.
                        // Surface the envelope here so SDK code-gen
                        // doesn't model the body as a bare Customer.
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        customer: { $ref: '#/components/schemas/Customer' },
                                    },
                                },
                            },
                        },
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
                        // Controller returns `{message, timeEntry}` — same
                        // envelope drift fixed for /v1/customer in #316.
                        // Pin the shape so SDK code-gen builds the right
                        // client type instead of leaving the body
                        // unspecified.
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        timeEntry: { $ref: '#/components/schemas/TimeEntry' },
                                    },
                                },
                            },
                        },
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
                responses: {
                    200: {
                        description: 'Found — {message, timeEntry, billing} envelope',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        timeEntry: { $ref: '#/components/schemas/TimeEntry' },
                                        billing: {
                                            type: 'object',
                                            description: 'Computed (not stored): the resolved hourly rate and billable amount (rate × hours; 0 when non-billable; null when no rate resolves).',
                                            properties: {
                                                rate: { type: 'number', nullable: true },
                                                billableAmount: { type: 'number', nullable: true },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    404: { description: 'Not found' },
                    403: { description: 'Auth failure' },
                },
            },
            patch: {
                summary: 'Partial update of a time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TimeEntry' } } } },
                responses: {
                    200: {
                        description: 'Updated — {message, timeEntry} envelope',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        timeEntry: { $ref: '#/components/schemas/TimeEntry' },
                                    },
                                },
                            },
                        },
                    },
                    400: { description: 'No updatable fields supplied' },
                    404: { description: 'Not found' },
                    403: { description: 'Auth failure' },
                },
            },
            delete: {
                summary: 'Soft-delete a time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'Archived — {message, id} envelope (id echoes the deleted row\'s teId)',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        id: { type: 'integer' },
                                    },
                                },
                            },
                        },
                    },
                    404: { description: 'Not found' },
                    403: { description: 'Auth failure' },
                },
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
                responses: {
                    200: {
                        description: 'OK — paginated time-entry list',
                        // Controller emits the standard pagination envelope —
                        // same shape every list endpoint uses. Mirrors the
                        // customer/bycompany declaration from #340 so SDK
                        // code-gen models the Link-header-paired response.
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string' },
                                        count: { type: 'integer' },
                                        limit: { type: 'integer' },
                                        offset: { type: 'integer' },
                                        timeEntries: {
                                            type: 'array',
                                            items: { $ref: '#/components/schemas/TimeEntry' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    400: { description: 'Invalid company id' },
                    403: { description: 'Auth failure' },
                },
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
        '/v1/invoice/rollup': {
            post: {
                summary: "Generate an invoice from a customer's billable time",
                description: 'Aggregates billable, job-linked, not-yet-invoiced time for a customer into one InvoiceJob line per job, sets the invoice totals via the exact-money service, and stamps each contributing entry so its minutes cannot be billed twice. Runs as one transaction.',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['invCustId'],
                                properties: {
                                    invCustId: { type: 'integer' },
                                    invDate: { type: 'string', format: 'date', description: 'Invoice issue date; defaults to today.' },
                                    invDueDate: { type: 'string', format: 'date', description: 'Defaults to invDate + 30 days.' },
                                    from: { type: 'string', format: 'date', description: 'Only include time started on/after this date.' },
                                    to: { type: 'string', format: 'date', description: 'Only include time started on/before this date.' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: 'Invoice generated — {message, invoice, lines, subtotal, tax, total, skipped} envelope',
                        headers: idempotencyReplayResponseHeader,
                    },
                    400: { description: 'No billable time to roll up, or invalid body' },
                    403: { description: 'Auth failure' },
                    404: { description: 'Customer not found (master key)' },
                },
            },
        },
        '/v1/invoice/{id}': {
            get: { summary: 'Get one invoice', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Found — {message, invoice, billing} envelope; billing = derived {status, total, amountPaid, balance} from allocated payments + due date' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            patch: { summary: 'Partial update of an invoice', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
            delete: { summary: 'Soft-delete an invoice', security: [{ authKey: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } } },
        },
        '/v1/report/hours': {
            get: {
                summary: 'Hours summary grouped by customer, job, and worker',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'workerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'Hours — {totalHours, billableHours, nonBillableHours, byCustomer[], byJob[], byWorker[]}' },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/unbilled': {
            get: {
                summary: 'Unbilled billable time, grouped customer → job',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'Unbilled time — {totalMinutes, totalHours, totalAmount, customers[]} (each customer → jobs with hours + amount)' },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/invoice/aging': {
            get: {
                summary: 'Accounts-receivable aging for a company',
                security: [{ authKey: [] }],
                parameters: [{ name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys; scoped keys use their own company.' }],
                responses: {
                    200: { description: 'AR aging — {buckets, totalOutstanding, invoices}; buckets = current / d1_30 / d31_60 / d61_90 / d90plus with {count, amount}' },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/invoice/{id}/pdf': {
            get: {
                summary: 'Download an invoice as a branded PDF',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: {
                        description: 'PDF document (attachment)',
                        content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
                    },
                    404: { description: 'Not found' },
                    403: { description: 'Auth failure' },
                },
            },
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
            post: {
                summary: 'Create a PO header',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderHeader' } } } },
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
            post: {
                summary: 'Create a PO line',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseOrderLine' } } } },
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
            post: {
                summary: 'Create an inventory transaction',
                security: [{ authKey: [] }],
                parameters: [idempotencyKeyHeader],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InventoryTransaction' } } } },
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
