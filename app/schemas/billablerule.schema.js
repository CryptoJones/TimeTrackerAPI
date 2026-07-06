// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** POST /v1/billablerule body (#415). bruCompId optional (non-master → own; master required). */
const createBillableRuleBody = z.object({
    bruName: z.string().min(1).max(255),
    bruPriority: z.coerce.number().int().min(0).max(100000).optional(),
    bruMatchJobId: z.coerce.number().int().positive().nullable().optional(),
    bruMatchTaskId: z.coerce.number().int().positive().nullable().optional(),
    bruMatchCategory: z.string().min(1).max(255).nullable().optional(),
    bruBillable: z.boolean(),
    bruCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: bruName, bruPriority, bruMatchJobId, bruMatchTaskId, bruMatchCategory, bruBillable, bruCompId.',
});

/** PATCH /v1/billablerule/:id — bruCompId is not patchable. */
const updateBillableRuleBody = z.object({
    bruName: z.string().min(1).max(255).optional(),
    bruPriority: z.coerce.number().int().min(0).max(100000).optional(),
    bruMatchJobId: z.coerce.number().int().positive().nullable().optional(),
    bruMatchTaskId: z.coerce.number().int().positive().nullable().optional(),
    bruMatchCategory: z.string().min(1).max(255).nullable().optional(),
    bruBillable: z.boolean().optional(),
    bruActive: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: bruName, bruPriority, bruMatchJobId, bruMatchTaskId, bruMatchCategory, bruBillable, bruActive.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

/** POST /v1/billablerule/evaluate body — classify a time-entry context. */
const evaluateBody = z.object({
    jobId: z.coerce.number().int().positive().optional(),
    taskId: z.coerce.number().int().positive().optional(),
    category: z.string().min(1).max(255).optional(),
    companyId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: jobId, taskId, category, companyId.',
});

module.exports = {
    intIdParam,
    createBillableRuleBody,
    updateBillableRuleBody,
    listByCompanyQuery,
    evaluateBody,
};
