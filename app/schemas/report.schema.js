// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Must be an ISO 8601 date (YYYY-MM-DD).',
});

/**
 * GET /v1/report/unbilled query. companyId required for master keys
 * (controller enforces); scoped keys default to their own company.
 * Optional customerId filter and from/to date bounds on entry start.
 */
const unbilledQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, from, to.',
});

/**
 * GET /v1/report/hours query. companyId required for master keys.
 * Optional customerId / workerId filters and from/to date bounds.
 */
const hoursQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    workerId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, workerId, from, to.',
});

/**
 * GET /v1/report/revenue query. companyId required for master keys.
 * Optional customerId filter and from/to (invoice date) bounds.
 */
const revenueQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, from, to.',
});

/**
 * GET /v1/report/billable-summary query. companyId required for master
 * keys. Optional customerId filter and from/to (entry start) bounds.
 */
const billableSummaryQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, from, to.',
});

/**
 * GET /v1/report/timesheet query. companyId required for master keys.
 * Optional customerId / workerId filters, from/to bounds, and period
 * ('day' default, or 'week').
 */
const timesheetQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    workerId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    period: z.enum(['day', 'week']).optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, workerId, from, to, period.',
});

/**
 * GET /v1/report/budget query. companyId required for master keys.
 * Budgets are lifetime per job, so no date/customer filters.
 */
const budgetQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId.',
});

/**
 * GET /v1/report/targets query. companyId required for master keys.
 * from and to are required — a target only means something over a range.
 */
const targetsQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    from: isoDate,
    to: isoDate,
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, from, to.',
});

/**
 * GET /v1/report/profitability query. companyId required for master keys.
 * Optional customerId / jobId filters and from/to bounds.
 */
const profitabilityQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    jobId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, jobId, from, to.',
});

module.exports = { unbilledQuery, hoursQuery, revenueQuery, billableSummaryQuery, timesheetQuery, budgetQuery, targetsQuery, profitabilityQuery };
