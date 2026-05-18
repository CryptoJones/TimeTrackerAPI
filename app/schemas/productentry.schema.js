// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createProductEntryBody = z.object({
    pentQty: z.coerce.number().int(),
    pentJobId: z.coerce.number().int().positive(),
    pentInvtId: z.coerce.number().int().positive(),
    pentTaxable: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: pentQty, pentJobId, pentInvtId, pentTaxable.',
});

const updateProductEntryBody = z.object({
    pentQty: z.coerce.number().int().optional(),
    pentInvtId: z.coerce.number().int().positive().optional(),
    pentTaxable: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: pentQty, pentInvtId, pentTaxable.',
});

const listByJobQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkProductEntryBody = z.object({
    productEntries: z.array(createProductEntryBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: productEntries (array).',
});

module.exports = {
    intIdParam,
    createProductEntryBody,
    updateProductEntryBody,
    listByJobQuery,
    bulkProductEntryBody,
};
