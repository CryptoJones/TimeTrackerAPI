// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Must be an ISO 8601 date (YYYY-MM-DD).',
});

// Cross-field refinement: an invoice's due date must be on or
// after its issue date. Mirrors the teEndedAt >= teStartedAt
// constraint from #130 — a due-before-issue invoice is operator
// error worth surfacing at the boundary instead of papering over.
// Equality (due same day as issue) is allowed: zero-day-net is a
// real billing term ("Due on Receipt").
//
// String comparison is safe here because `isoDate` is the strict
// `YYYY-MM-DD` regex above; lexicographic order on that shape
// matches chronological order for any valid input.
function refineDueDateAfterIssue(data) {
    if (!data.invDate || !data.invDueDate) return true;
    return data.invDueDate >= data.invDate;
}
const DUE_BEFORE_ISSUE = {
    message: 'invDueDate must be on or after invDate.',
    path: ['invDueDate'],
};

const createInvoiceBody = z.object({
    invCustId: z.coerce.number().int().positive(),
    invDate: isoDate,
    invDueDate: isoDate,
    // invPaid is `boolean NOT NULL` in the DB (no DB-level default).
    // The single-create controller already short-circuits a missing
    // value to `false`, but the bulk-create path (`makeBulkCreateIndirect`)
    // doesn't know to do that, so a bulk POST without invPaid landed
    // as "null value in column invPaid violates not-null constraint"
    // at the postgres layer — surfacing as a 500 instead of a clean
    // accepted row. Switching from `.optional()` to `.default(false)`
    // fills the value at the validator boundary, which both paths
    // consume via `validate.body()` (see app/middleware/validate.js).
    invPaid: z.boolean().default(false),
}).strict({
    message: 'Unexpected field in body. Whitelist: invCustId, invDate, invDueDate, invPaid.',
}).refine(refineDueDateAfterIssue, DUE_BEFORE_ISSUE);

const updateInvoiceBody = z.object({
    invDate: isoDate.optional(),
    invDueDate: isoDate.optional(),
    invPaid: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invDate, invDueDate, invPaid.',
}).refine(refineDueDateAfterIssue, DUE_BEFORE_ISSUE);

const listByCustomerQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkInvoiceBody = z.object({
    invoices: z.array(createInvoiceBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: invoices (array).',
});

/**
 * POST /v1/invoice/rollup — generate an invoice from a customer's
 * billable, uninvoiced time (#382). invCustId is required; invDate /
 * invDueDate default (today / +30d) when omitted; from / to optionally
 * bound the time entries by their start date (inclusive, whole days).
 */
const rollupInvoiceBody = z.object({
    invCustId: z.coerce.number().int().positive(),
    invDate: isoDate.optional(),
    invDueDate: isoDate.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    // Optional tax-rate override (fraction 0..1); defaults to the
    // company's compTaxRate.
    taxRate: z.coerce.number().min(0).max(1).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invCustId, invDate, invDueDate, from, to, taxRate.',
}).refine(refineDueDateAfterIssue, DUE_BEFORE_ISSUE);

// GET /v1/invoice/aging query. companyId required for master keys
// (controller enforces); scoped keys default to their own company.
const agingQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId.',
});

module.exports = {
    intIdParam,
    createInvoiceBody,
    updateInvoiceBody,
    listByCustomerQuery,
    bulkInvoiceBody,
    rollupInvoiceBody,
    agingQuery,
};
