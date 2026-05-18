// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createInventoryItemBody = z.object({
    invitDescription: z.string().min(1).max(1000),
    invitQty: z.coerce.number(),
    invitCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invitDescription, invitQty, invitCompId.',
});

const updateInventoryItemBody = z.object({
    invitDescription: z.string().min(1).max(1000).optional(),
    invitQty: z.coerce.number().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invitDescription, invitQty.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkInventoryItemBody = z.object({
    inventoryItems: z.array(createInventoryItemBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: inventoryItems (array).',
});

module.exports = {
    intIdParam,
    createInventoryItemBody,
    updateInventoryItemBody,
    listByCompanyQuery,
    bulkInventoryItemBody,
};
