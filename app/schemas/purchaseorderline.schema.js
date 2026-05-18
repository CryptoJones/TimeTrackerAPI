// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createBody = z.object({
    polpoh: z.coerce.number().int().positive(),
    polItemDesc: z.string().min(1).max(1000),
    polQty: z.coerce.number(),
    polPrice: z.coerce.number(),
    polInvtId: z.coerce.number().int().positive(),
}).strict({
    message: 'Unexpected field in body. Whitelist: polpoh, polItemDesc, polQty, polPrice, polInvtId.',
});

const updateBody = z.object({
    polItemDesc: z.string().min(1).max(1000).optional(),
    polQty: z.coerce.number().optional(),
    polPrice: z.coerce.number().optional(),
    polInvtId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: polItemDesc, polQty, polPrice, polInvtId.',
});

const listByHeaderQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkBody = z.object({
    purchaseOrderLines: z.array(createBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: purchaseOrderLines (array).',
});

module.exports = {
    intIdParam,
    createBody,
    updateBody,
    listByHeaderQuery,
    bulkBody,
};
