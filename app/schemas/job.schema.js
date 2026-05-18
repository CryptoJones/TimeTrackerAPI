// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createJobBody = z.object({
    jobCustId: z.coerce.number().int().positive(),
    jobDesc: z.string().min(1).max(10000),
}).strict({
    message: 'Unexpected field in body. Whitelist: jobCustId, jobDesc.',
});

const updateJobBody = z.object({
    jobDesc: z.string().min(1).max(10000).optional(),
    jobInvoiced: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: jobDesc, jobInvoiced.',
});

const listByCustomerQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkJobBody = z.object({
    jobs: z.array(createJobBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: jobs (array).',
});

module.exports = {
    intIdParam,
    createJobBody,
    updateJobBody,
    listByCustomerQuery,
    bulkJobBody,
};
