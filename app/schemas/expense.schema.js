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

// A finite, positive amount. Zero/negative expenses are operator error.
const expAmountField = z.coerce.number().finite({
    message: 'expAmount must be a finite number.',
}).positive({ message: 'expAmount must be greater than zero.' });

/**
 * POST /v1/expense body. expCompId is optional for non-master keys
 * (defaults to the authKey's company) and required for master keys
 * (controller enforces). expDate + expAmount are required; expCustId /
 * expJobId / category / description are optional.
 */
const createExpenseBody = z.object({
    expCompId: z.coerce.number().int().positive().optional(),
    expCustId: z.coerce.number().int().positive().optional(),
    expJobId: z.coerce.number().int().positive().optional(),
    expCategory: z.string().max(255).optional(),
    expDescription: z.string().max(10000).optional(),
    expBillable: z.boolean().optional(),
    // A fraction (0.15 = +15%). Cap at the DECIMAL(6,4) column max so an
    // out-of-range markup returns a clean 400 instead of overflowing to a
    // 500 at write; >100% (>1.0) is intentionally allowed.
    expMarkupPct: z.coerce.number().min(0).max(99.9999).optional(),
    expDate: isoDate,
    expAmount: expAmountField,
}).strict({
    message: 'Unexpected field in body. Whitelist: expCompId, expCustId, expJobId, expCategory, expDescription, expBillable, expMarkupPct, expDate, expAmount.',
});

/**
 * PATCH /v1/expense/:id body. All optional; expCompId is server-managed
 * and not settable here. expCustId / expJobId accept null to unlink.
 */
const updateExpenseBody = z.object({
    expCustId: z.coerce.number().int().positive().nullable().optional(),
    expJobId: z.coerce.number().int().positive().nullable().optional(),
    expCategory: z.string().max(255).nullable().optional(),
    expDescription: z.string().max(10000).nullable().optional(),
    expBillable: z.boolean().optional(),
    expMarkupPct: z.coerce.number().min(0).max(99.9999).nullable().optional(),
    expDate: isoDate.optional(),
    expAmount: expAmountField.optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: expCustId, expJobId, expCategory, expDescription, expBillable, expMarkupPct, expDate, expAmount.',
});

const listByCompanyQuery = z.object({
    customerId: z.coerce.number().int().positive().optional(),
    jobId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: customerId, jobId, from, to, limit, offset.',
});

module.exports = {
    intIdParam,
    createExpenseBody,
    updateExpenseBody,
    listByCompanyQuery,
};
