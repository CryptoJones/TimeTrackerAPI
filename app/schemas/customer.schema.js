// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/**
 * Body schema for POST /v1/customer.
 *
 * Whitelist semantics: any field not listed here is stripped via
 * .strip() (zod's default). Server-managed fields (custId, custArch)
 * are NOT accepted from the body at all.
 *
 * teCompId is optional here because the controller may default it
 * to the authKey's owning company for non-master keys. Master keys
 * must supply it; the controller enforces that separately so it
 * can emit a 400 with the contextual message rather than a generic
 * zod issue.
 */
const createCustomerBody = z.object({
    custCompanyName: z.string().max(255).optional(),
    custFName: z.string().max(255).optional(),
    custLName: z.string().max(255).optional(),
    custAddress1: z.string().max(255).optional(),
    custAddress2: z.string().max(255).optional(),
    custCity: z.string().max(255).optional(),
    // custState matches the DB column: varchar(2) — US state codes
    // ("NE", "CA", etc.) and Canadian province codes ("AB", "BC").
    // Without this length constraint, anything ≤ 255 chars passed zod
    // and surfaced as a 500 at the postgres INSERT layer ("value too
    // long for type character varying(2)") instead of a clean 400.
    custState: z.string().length(2).optional(),
    custZip: z.string().max(32).optional(),
    custPhone: z.string().max(64).optional(),
    custEmail: z.string().email().max(255).optional(),
    custCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: custCompanyName, custFName, custLName, custAddress1, custAddress2, custCity, custState, custZip, custPhone, custEmail, custCompId.',
});

/**
 * POST /v1/customer/bulk body. Array of customer-create bodies wrapped
 * in { customers: [...] }. Each entry is validated by the same
 * createCustomerBody schema, so unknown fields are rejected uniformly.
 *
 * Capped at 500 entries to keep individual requests bounded; an ETL
 * job pushing more should chunk.
 */
const bulkCustomerBody = z.object({
    customers: z.array(createCustomerBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: customers (array).',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

/**
 * GET /v1/customer/search query schema.
 *
 * `q` is the substring to match against custCompanyName, custFName,
 * and custLName (case-insensitive ILIKE). 2-char minimum so we don't
 * page-scan the table on every dropdown keystroke.
 *
 * `companyId` is master-only — non-master keys are auto-scoped to
 * their authKey's owning company and a `companyId` param that
 * doesn't match returns 403.
 */
/**
 * GET /v1/customer/export.csv query schema. Same shape as search
 * minus the `q` requirement.
 */
const exportCsvQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(5000).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, limit, offset.',
});

const searchQuery = z.object({
    q: z.string().min(2).max(255),
    companyId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: q (>= 2 chars), companyId, limit, offset.',
});

module.exports = {
    intIdParam,
    createCustomerBody,
    bulkCustomerBody,
    listByCompanyQuery,
    searchQuery,
    exportCsvQuery,
};
