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
        // Billing links (#372: these were accepted by the create/update
        // schema and stored by the model, but missing from this component).
        teWorkerId: { type: 'integer', nullable: true, description: 'Worker who logged the time (#385).' },
        teJobId: { type: 'integer', nullable: true, description: 'Job the time rolls up to (#386).' },
        teBillTypeId: { type: 'integer', nullable: true, description: 'Per-entry billing-type rate override.' },
        teTaskId: { type: 'integer', nullable: true, description: 'Task under the job (#407).' },
        teDescription: { type: 'string', maxLength: 10000 },
        teStartedAt: { type: 'string', format: 'date-time' },
        teEndedAt: { type: 'string', format: 'date-time', nullable: true },
        teMinutes: { type: 'integer', nullable: true, readOnly: true },
        teBillable: { type: 'boolean', default: true },
        teTags: { type: 'array', items: { type: 'string' }, nullable: true, description: 'Free-form tags (#397).' },
        teApprovalStatus: { type: 'string', enum: ['open', 'submitted', 'approved', 'rejected'], readOnly: true, description: 'Timesheet approval state (#440).' },
        teInvJobId: { type: 'integer', nullable: true, readOnly: true, description: 'Set when the entry is rolled into an invoice.' },
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
        '/v1/timeentry/start': {
            post: {
                summary: 'Start an in-flight timer',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Timer started' },
                    400: { description: 'Validation error' },
                    403: { description: 'Auth failure' },
                    409: { description: 'Worker already has a running timer' },
                },
            },
        },
        '/v1/timeentry/{id}/stop': {
            post: {
                summary: 'Stop a running timer (sets end + computes minutes)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Timer stopped' },
                    404: { description: 'Not found' },
                    409: { description: 'Timer already stopped' },
                },
            },
        },
        '/v1/timeentry/approval-reminders': {
            post: {
                summary: 'Email a digest of stale pending approvals (#442)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { to: { type: 'string', format: 'email' }, olderThanDays: { type: 'integer' }, companyId: { type: 'integer' } }, required: ['to'] } } } },
                responses: {
                    200: { description: 'Digest sent (or nothing pending) — {pending, reminded, to}' },
                    400: { description: 'Master keys must specify companyId / invalid body' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/timeentry/{id}/copy': {
            post: {
                summary: 'Copy a time entry into a fresh entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object', properties: { teStartedAt: { type: 'string', format: 'date-time' }, teEndedAt: { type: 'string', format: 'date-time' } } } } },
                },
                responses: {
                    201: { description: 'Copied' },
                    400: { description: 'Inverted range' },
                    404: { description: 'Not found' },
                    409: { description: 'Copy lands in a locked period' },
                },
            },
        },
        '/v1/timeentry/{id}/approval': {
            post: {
                summary: 'Advance a time entry through the approval workflow',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object', properties: { action: { type: 'string', enum: ['submit', 'approve', 'reject'] } }, required: ['action'] } } },
                },
                responses: {
                    200: { description: 'Approval updated' },
                    400: { description: 'Bad action' },
                    404: { description: 'Not found' },
                    409: { description: 'Illegal transition from current state' },
                },
            },
        },
        '/v1/timeentry/bulk': {
            post: {
                summary: 'Bulk-import time entries — per-row results (#379)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { teCompId: { type: 'integer', description: 'Required for master keys.' }, entries: { type: 'array', items: { $ref: '#/components/schemas/TimeEntry' }, minItems: 1, maxItems: 200 } }, required: ['entries'] } } } },
                responses: {
                    201: { description: 'All rows created — { requested, created, failed, results[] }' },
                    207: { description: 'Partial — some rows failed; see results[]' },
                    400: { description: 'Validation error or all rows failed' },
                    403: { description: 'Auth failure' },
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
        '/v1/worker/{id}/timeentries': {
            get: {
                summary: "List a worker's time entries",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: {
                    200: { description: 'Found (paginated)' },
                    404: { description: 'Worker not found / cross-tenant' },
                },
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
        '/v1/invoice/payment-reminders': {
            post: {
                summary: 'Email a dunning digest of overdue invoices (#10)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { to: { type: 'string', format: 'email' }, olderThanDays: { type: 'integer' }, companyId: { type: 'integer' } }, required: ['to'] } } } },
                responses: {
                    200: { description: 'Digest sent (or none overdue) — {overdue, totalOutstanding, reminded, to}' },
                    400: { description: 'Master keys must specify companyId / invalid body' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/invoice/from-phase': {
            post: {
                summary: "Milestone billing — invoice a phase's budget (#428)",
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { phaseId: { type: 'integer' }, invDate: { type: 'string', format: 'date' }, invDueDate: { type: 'string', format: 'date' }, taxRate: { type: 'number' }, discount: { type: 'number' }, currency: { type: 'string' }, notes: { type: 'string' } }, required: ['phaseId'] } } } },
                responses: {
                    201: { description: 'Invoice generated from the phase' },
                    400: { description: 'Phase has no budget / validation error' },
                    404: { description: 'Phase not found / cross-tenant' },
                    409: { description: 'Phase already billed' },
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
        '/v1/auditlog/bycompany/{id}': {
            get: {
                summary: "A company's audit trail (successful mutations)",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'method', in: 'query', schema: { type: 'string', enum: ['POST', 'PATCH', 'PUT', 'DELETE'] } },
                    { name: 'entity', in: 'query', schema: { type: 'string' } },
                    { name: 'entityId', in: 'query', schema: { type: 'integer' }, description: 'DCAA (#462): a specific record.' },
                    { name: 'actor', in: 'query', schema: { type: 'string' }, description: 'DCAA (#462): filter by actor.' },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'DCAA (#462): window start.' },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'DCAA (#462): window end.' },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: {
                    200: { description: 'Found — entries[] (actor, method, path, entity, entityId, status, changes, reason, createdAt), newest first' },
                    400: { description: 'Validation error' },
                    403: { description: 'Auth failure / cross-tenant' },
                },
            },
        },
        '/v1/retainer': {
            post: {
                summary: 'Open a retainer for a customer',
                security: [{ authKey: [] }],
                responses: { 201: { description: 'Created' }, 400: { description: 'Validation error or bad retCustId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/retainer/bycustomer/{id}': {
            get: {
                summary: "List a customer's retainers",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 404: { description: 'Customer not found / cross-tenant' } },
            },
        },
        '/v1/retainer/{id}/drawdown': {
            post: {
                summary: 'Draw an amount down from a retainer',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] } } } },
                responses: { 200: { description: 'Drawn down' }, 400: { description: 'Bad amount' }, 404: { description: 'Not found' }, 409: { description: 'Exceeds balance' } },
            },
        },
        '/v1/retainer/{id}': {
            get: {
                summary: 'Fetch a retainer',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a retainer note',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Nothing to update' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a retainer',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/reportschedule': {
            post: {
                summary: 'Schedule a report for email delivery (#57)',
                security: [{ authKey: [] }],
                responses: { 201: { description: 'Created' }, 400: { description: 'Validation error; master keys must specify rptschCompId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/reportschedule/due': {
            get: {
                summary: 'List report schedules due (next run ≤ today)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 400: { description: 'Master keys must specify companyId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/reportschedule/bycompany/{id}': {
            get: {
                summary: "List a company's report schedules",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/reportschedule/{id}/run': {
            post: {
                summary: 'Render the report, email it, and advance the schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Delivered (returns previousRun + nextRun)' }, 404: { description: 'Not found' }, 409: { description: 'Schedule is not active' } },
            },
        },
        '/v1/reportschedule/{id}': {
            get: {
                summary: 'Fetch a report schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a report schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a report schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/receipt': {
            post: {
                summary: 'Attach a base64 file to an expense (#419)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { expId: { type: 'integer' }, filename: { type: 'string' }, contentType: { type: 'string' }, dataBase64: { type: 'string' } }, required: ['expId', 'filename', 'contentType', 'dataBase64'] } } } },
                responses: {
                    201: { description: 'Attached (metadata; bytes not echoed)' },
                    400: { description: 'Validation error / bad expense / too large' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/receipt/byexpense/{id}': {
            get: {
                summary: "List an expense's receipts (metadata only)",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found (paginated; no file bytes)' }, 404: { description: 'Expense not found / cross-tenant' } },
            },
        },
        '/v1/receipt/{id}/download': {
            get: {
                summary: 'Download a receipt file',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'The file (Content-Type + Content-Disposition attachment)', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
                    404: { description: 'Not found' },
                },
            },
        },
        '/v1/receipt/{id}': {
            get: {
                summary: 'Fetch receipt metadata (not the bytes)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a receipt',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/login': {
            post: {
                summary: 'Sign in a user — returns a JWT (#445)',
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { userEmail: { type: 'string', format: 'email' }, password: { type: 'string' }, companyId: { type: 'integer' } }, required: ['userEmail', 'password', 'companyId'] } } } },
                responses: {
                    200: { description: 'Signed in — {token, tokenType, expiresIn, user}' },
                    400: { description: 'Validation error' },
                    401: { description: 'Invalid credentials' },
                    503: { description: 'Sign-in not configured (JWT_SECRET unset)' },
                },
            },
        },
        '/v1/me': {
            get: {
                summary: 'Return the signed-in user for a Bearer token (#445)',
                parameters: [{ name: 'Authorization', in: 'header', schema: { type: 'string' }, description: 'Bearer <jwt>' }],
                responses: {
                    200: { description: 'The signed-in user' },
                    401: { description: 'Missing / invalid / expired token' },
                    503: { description: 'Sign-in not configured' },
                },
            },
        },
        '/v1/password-reset/request': {
            post: {
                summary: 'Request a password-reset token by email (#446)',
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { userEmail: { type: 'string', format: 'email' }, companyId: { type: 'integer' } }, required: ['userEmail', 'companyId'] } } } },
                responses: {
                    200: { description: 'Always 200 (anti-enumeration) — a token is emailed if the account exists' },
                    400: { description: 'Validation error' },
                },
            },
        },
        '/v1/password-reset/confirm': {
            post: {
                summary: 'Set a new password using a reset token (#446)',
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, newPassword: { type: 'string' } }, required: ['token', 'newPassword'] } } } },
                responses: {
                    200: { description: 'Password updated' },
                    400: { description: 'Invalid or expired token / validation error' },
                },
            },
        },
        '/v1/user': {
            post: {
                summary: 'Create a user account (#444)',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Created (password hash never returned)' },
                    400: { description: 'Validation error; master keys must specify userCompId' },
                    403: { description: 'Auth failure' },
                    409: { description: 'Email already in use' },
                },
            },
        },
        '/v1/user/bycompany/{id}': {
            get: {
                summary: "List a company's users — metadata only",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated; never returns the password hash)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/user/{id}': {
            get: {
                summary: 'Fetch a user (metadata only)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a user (email / name / password)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a user',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/user/{id}/role': {
            patch: {
                summary: "Set a user's RBAC role (#448)",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { userRole: { type: 'string', enum: ['owner', 'admin', 'manager', 'member', 'viewer'] } }, required: ['userRole'] } } } },
                responses: { 200: { description: 'Role updated' }, 400: { description: 'Invalid role' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/user/{id}/permissions': {
            get: {
                summary: "A user's role + effective permissions (#448)",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found — {userId, userRole, permissions[]}' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/gdpr/customer/{id}/export': {
            get: {
                summary: "Export all data held about a customer — GDPR portability (#461)",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Portable JSON: customer + invoices, jobs, expenses, time entries, payments, retainers, recurring invoices + counts' },
                    404: { description: 'Not found / cross-tenant' },
                },
            },
        },
        '/v1/gdpr/customer/{id}/erase': {
            post: {
                summary: "Erase a customer's personal data — GDPR right-to-erasure (#461)",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Personal data scrubbed (financial records retained); row archived' },
                    404: { description: 'Not found / cross-tenant' },
                },
            },
        },
        '/v1/billablerule': {
            post: {
                summary: 'Define a billable-classification rule (#415)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { bruName: { type: 'string' }, bruPriority: { type: 'integer' }, bruMatchJobId: { type: 'integer', nullable: true }, bruMatchTaskId: { type: 'integer', nullable: true }, bruMatchCategory: { type: 'string', nullable: true }, bruBillable: { type: 'boolean' }, bruCompId: { type: 'integer' } }, required: ['bruName', 'bruBillable'] } } } },
                responses: { 201: { description: 'Created' }, 400: { description: 'Validation error; master keys must specify bruCompId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/billablerule/evaluate': {
            post: {
                summary: 'Classify a { jobId, taskId, category } context (#415)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { jobId: { type: 'integer' }, taskId: { type: 'integer' }, category: { type: 'string' }, companyId: { type: 'integer' } } } } } },
                responses: { 200: { description: '{ billable, matchedRuleId } — billable null if no rule matches' }, 400: { description: 'Master keys must specify companyId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/billablerule/bycompany/{id}': {
            get: {
                summary: "List a company's billable rules (priority order)",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/billablerule/{id}': {
            get: {
                summary: 'Fetch a billable rule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a billable rule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a billable rule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/customfield': {
            post: {
                summary: 'Declare a typed custom field for an entity (#409)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { cfdEntity: { type: 'string', enum: ['customer', 'job', 'timeentry'] }, cfdName: { type: 'string' }, cfdLabel: { type: 'string' }, cfdType: { type: 'string', enum: ['text', 'number', 'date', 'boolean'] }, cfdRequired: { type: 'boolean' }, cfdCompId: { type: 'integer' } }, required: ['cfdEntity', 'cfdName', 'cfdType'] } } } },
                responses: { 201: { description: 'Created' }, 400: { description: 'Validation error; master keys must specify cfdCompId' }, 403: { description: 'Auth failure' }, 409: { description: 'Duplicate field name for the entity' } },
            },
        },
        '/v1/customfield/validate': {
            post: {
                summary: "Validate a values object against a company entity's custom fields (#409)",
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { entity: { type: 'string', enum: ['customer', 'job', 'timeentry'] }, values: { type: 'object' }, companyId: { type: 'integer' } }, required: ['entity', 'values'] } } } },
                responses: { 200: { description: 'Valid — coerced { values }' }, 422: { description: 'Invalid — { errors } per field' }, 400: { description: 'Validation error' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/customfield/bycompany/{id}': {
            get: {
                summary: "List a company's custom fields (optional ?entity)",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'entity', in: 'query', schema: { type: 'string', enum: ['customer', 'job', 'timeentry'] } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/customfield/{id}': {
            get: {
                summary: 'Fetch a custom field',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a custom field',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a custom field',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/capacity/summary': {
            get: {
                summary: 'Per-worker capacity / utilization for a period (#459)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                ],
                responses: { 200: { description: 'Rows (target/logged/remaining hours + utilization %) + weeks + totals' }, 400: { description: 'Missing from/to; master keys must specify companyId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/payroll/summary': {
            get: {
                summary: 'Per-worker payroll totals for a pay period, as JSON (#456)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                ],
                responses: { 200: { description: 'Payroll summary — rows (hours + labor cost per worker) + totals' }, 400: { description: 'Missing from/to; master keys must specify companyId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/payroll/export': {
            get: {
                summary: 'Per-worker payroll totals for a pay period, as a payroll-ready CSV (#456)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                ],
                responses: {
                    200: { description: 'CSV (Content-Disposition attachment); OWASP formula-injection safe', content: { 'text/csv': { schema: { type: 'string' } } } },
                    400: { description: 'Missing from/to; master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/share/invoice/{id}': {
            post: {
                summary: 'Mint a signed, expiring shareable link for an invoice (#438)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { expiresInSec: { type: 'integer', description: 'Link lifetime (default 7 days, max 90 days).' } } } } } },
                responses: {
                    201: { description: 'Link created — {token, path, expiresIn}' },
                    403: { description: 'Auth failure' },
                    404: { description: 'Not found / cross-tenant' },
                    503: { description: 'SHARE_SECRET not configured' },
                },
            },
        },
        '/v1/share/invoice': {
            get: {
                summary: 'View an invoice via a signed link — PUBLIC, no API key (#438)',
                parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Read-only invoice projection (totals, balance, customer name)' },
                    401: { description: 'Invalid or expired link' },
                    404: { description: 'Invoice not found' },
                    503: { description: 'SHARE_SECRET not configured' },
                },
            },
        },
        '/v1/invitation': {
            post: {
                summary: 'Invite a teammate to a company workspace (#458)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { invtEmail: { type: 'string', format: 'email' }, invtRole: { type: 'string', enum: ['owner', 'admin', 'manager', 'member', 'viewer'] }, invtCompId: { type: 'integer' } }, required: ['invtEmail', 'invtRole'] } } } },
                responses: { 201: { description: 'Invitation sent (token emailed)' }, 400: { description: 'Validation error; master keys must specify invtCompId' }, 403: { description: 'Auth failure' }, 409: { description: 'A user with that email already exists' } },
            },
        },
        '/v1/invitation/accept': {
            post: {
                summary: 'Accept an invitation — PUBLIC; provisions a user (#458)',
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, userName: { type: 'string' }, password: { type: 'string' } }, required: ['token', 'password'] } } } },
                responses: { 201: { description: 'User provisioned with the invited role' }, 400: { description: 'Invalid or expired invitation / validation error' }, 409: { description: 'A user with that email already exists' } },
            },
        },
        '/v1/invitation/bycompany/{id}': {
            get: {
                summary: "List a company's invitations (no token hash)",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/invitation/{id}': {
            delete: {
                summary: 'Revoke an invitation',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Revoked' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/approvalchain': {
            post: {
                summary: 'Define a multi-level approval chain (#443)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { apchName: { type: 'string' }, apchLevels: { type: 'array', items: { type: 'object', properties: { approverRole: { type: 'string', enum: ['owner', 'admin', 'manager', 'member', 'viewer'] } } } }, apchCompId: { type: 'integer' } }, required: ['apchName', 'apchLevels'] } } } },
                responses: { 201: { description: 'Created' }, 400: { description: 'Validation error; master keys must specify apchCompId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/approvalchain/bycompany/{id}': {
            get: {
                summary: "List a company's approval chains",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/approvalchain/{id}/next': {
            get: {
                summary: 'Resolve the next required approval level/role (#443)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'approvals', in: 'query', required: true, schema: { type: 'integer' }, description: 'Approvals recorded so far.' },
                    { name: 'actorRole', in: 'query', schema: { type: 'string' }, description: 'If given, adds canApprove.' },
                ],
                responses: { 200: { description: '{ done, nextLevel, requiredRole, totalLevels, canApprove? }' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/approvalchain/{id}': {
            get: {
                summary: 'Fetch an approval chain',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update an approval chain',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive an approval chain',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/rateschedule': {
            post: {
                summary: 'Create an effective-dated rate (#414)',
                security: [{ authKey: [] }],
                responses: { 201: { description: 'Created' }, 400: { description: 'Validation error; master keys must specify rschCompId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/rateschedule/resolve': {
            get: {
                summary: 'Resolve the effective rate on a given date',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                ],
                responses: { 200: { description: 'Effective rate — {companyId, date, rate}' }, 400: { description: 'Missing date / companyId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/rateschedule/bycompany/{id}': {
            get: {
                summary: "List a company's rate schedules",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/rateschedule/{id}': {
            get: {
                summary: 'Fetch a rate schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a rate schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a rate schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/notification/test': {
            post: {
                summary: 'Send a test email to verify the mail transport (master only)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { to: { type: 'string', format: 'email' }, subject: { type: 'string' }, text: { type: 'string' } }, required: ['to'] } } } },
                responses: {
                    200: { description: 'Sent (or captured) — returns the active transport name' },
                    400: { description: 'Invalid recipient / body' },
                    403: { description: 'Not a master key' },
                },
            },
        },
        '/v1/notification/dispatch': {
            post: {
                summary: 'Dispatch a Slack/Teams notification (#454)',
                security: [{ authKey: [] }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { channel: { type: 'string', enum: ['slack', 'teams'] }, text: { type: 'string' } }, required: ['channel', 'text'] } } } },
                responses: {
                    200: { description: 'Dispatched (or captured) — returns the active transport name' },
                    400: { description: 'Invalid channel / text' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/webhook': {
            post: {
                summary: 'Register an outbound webhook',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Registered (secret is never returned)' },
                    400: { description: 'Validation error; master keys must specify whkCompId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/webhook/bycompany/{id}': {
            get: {
                summary: "List a company's webhooks (metadata only)",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated; never returns the secret)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/webhook/{id}/ping': {
            post: {
                summary: 'Deliver a test "ping" event to the endpoint',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Delivery attempted (returns {delivered, status, error})' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/webhook/{id}': {
            get: {
                summary: 'Fetch a webhook (metadata only)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a webhook (url / event / secret / active)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a webhook',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/apikey': {
            post: {
                summary: 'Provision a new API key for a company (master only)',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Created — returns the raw key ONCE (only its hash is stored)' },
                    400: { description: 'Validation error' },
                    403: { description: 'Not a master key' },
                },
            },
        },
        '/v1/apikey/bycompany/{id}': {
            get: {
                summary: "List a company's API keys — metadata only (master only)",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated; never returns the key hash)' }, 403: { description: 'Not a master key' } },
            },
        },
        '/v1/apikey/{id}/rotate': {
            post: {
                summary: 'Rotate a key in place — old key invalidated (master only)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Rotated — returns the new raw key ONCE' },
                    403: { description: 'Not a master key' },
                    404: { description: 'Not found' },
                },
            },
        },
        '/v1/apikey/{id}': {
            get: {
                summary: 'Fetch API key metadata (master only; never the hash)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 403: { description: 'Not a master key' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Revoke an API key (master only)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Revoked' }, 403: { description: 'Not a master key' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/recurringinvoice': {
            post: {
                summary: 'Create a recurring invoice schedule',
                security: [{ authKey: [] }],
                responses: { 201: { description: 'Created' }, 400: { description: 'Validation error or bad customer' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/recurringinvoice/due': {
            get: {
                summary: 'List schedules due for invoicing (next run ≤ today)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 400: { description: 'Master keys must specify companyId' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/recurringinvoice/bycustomer/{id}': {
            get: {
                summary: "List a customer's schedules",
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found (paginated)' }, 404: { description: 'Customer not found / cross-tenant' } },
            },
        },
        '/v1/recurringinvoice/{id}/run': {
            post: {
                summary: 'Advance a schedule by its cadence',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Advanced (returns previousRun + nextRun)' }, 404: { description: 'Not found' }, 409: { description: 'Schedule is not active' } },
            },
        },
        '/v1/recurringinvoice/{id}': {
            get: {
                summary: 'Fetch a schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a schedule (cadence / next run / active / note)',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a schedule',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/role': {
            post: {
                summary: 'Create a billing role (name + rate)',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Created' },
                    400: { description: 'Validation error; master keys must specify roleCompId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/role/bycompany/{id}': {
            get: {
                summary: "List a company's roles",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Cross-tenant' } },
            },
        },
        '/v1/role/{id}': {
            get: {
                summary: 'Fetch a role',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a role',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a role',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/phase': {
            post: {
                summary: 'Create a phase / billing stage under a job',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Created' },
                    400: { description: 'Validation error or bad phaseJobId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/phase/byjob/{id}': {
            get: {
                summary: "List a job's phases",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 404: { description: 'Job not found / cross-tenant' } },
            },
        },
        '/v1/phase/{id}': {
            get: {
                summary: 'Fetch a phase',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a phase',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a phase',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/task': {
            post: {
                summary: 'Create a task / activity under a job',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Created' },
                    400: { description: 'Validation error or bad taskJobId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/task/byjob/{id}': {
            get: {
                summary: "List a job's tasks",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    { name: 'offset', in: 'query', schema: { type: 'integer' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 404: { description: 'Job not found / cross-tenant' } },
            },
        },
        '/v1/task/{id}': {
            get: {
                summary: 'Fetch a task',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update a task',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive a task',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/expense': {
            post: {
                summary: 'Create an expense',
                security: [{ authKey: [] }],
                responses: {
                    201: { description: 'Created' },
                    400: { description: 'Validation error or bad customer/job link' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/expense/bycompany/{id}': {
            get: {
                summary: "List a company's expenses",
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'jobId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: { 200: { description: 'Found (paginated)' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/expense/{id}': {
            get: {
                summary: 'Fetch an expense',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
            },
            patch: {
                summary: 'Update an expense',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
            },
            delete: {
                summary: 'Archive an expense',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' } },
            },
        },
        '/v1/report/targets': {
            get: {
                summary: 'Worker target hours vs actuals (under/on/over)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'Targets — {weeks, workers[] (target/actual/ratio/status), underCount}' },
                    400: { description: 'Missing from/to, or master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/budget': {
            get: {
                summary: 'Project budget vs actuals (hours + amount, with alerts)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                ],
                responses: {
                    200: { description: 'Budget — {jobs[] (budget/actual/ratio/status per hours & amount), count, overCount}' },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/timesheet': {
            get: {
                summary: 'Timesheet grid — hours per worker per day or week',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'workerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'period', in: 'query', schema: { type: 'string', enum: ['day', 'week'] }, description: 'Default day.' },
                ],
                responses: {
                    200: { description: 'Grid — {period, buckets[], rows[] (worker × period), bucketTotals[], grandTotalHours}' },
                    400: { description: 'Master keys must specify companyId, or bad period' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/billable-summary': {
            get: {
                summary: 'Billable vs non-billable time by month (+ ratio)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'Summary — {billableRatio, totalBillableHours, totalNonBillableHours, totalBillableAmount, periods[]}' },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/profitability': {
            get: {
                summary: 'Project profitability & margin (revenue − cost per job)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'jobId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'Per-job {revenue, cost, margin, marginPct} + totals; flags entries missing a rate/cost basis' },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/utilization': {
            get: {
                summary: 'Worker utilization (billable hours vs capacity)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'workerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'Per-worker {capacity, billable, utilizationPct, billableRatioPct} + team totals' },
                    400: { description: 'from/to required; master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/revenue.pdf': {
            get: {
                summary: 'Revenue summary as a printable PDF (#433)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'application/pdf attachment', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
        },
        '/v1/report/revenue': {
            get: {
                summary: 'Revenue & earnings summary (by customer and month)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'companyId', in: 'query', schema: { type: 'integer' }, description: 'Required for master keys.' },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Invoice date lower bound.' },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: {
                    200: { description: 'Revenue — {totalRevenue, totalCollected, totalOutstanding, byCustomer[], byPeriod[]}' },
                    400: { description: 'Master keys must specify companyId' },
                    403: { description: 'Auth failure' },
                },
            },
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
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'format', in: 'query', schema: { type: 'string', enum: ['summary', 'detailed'] }, description: 'Detailed (default) itemizes lines; summary collapses them.' },
                ],
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
