// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// `invitQty` is the on-hand inventory quantity stored as a Sequelize
// DOUBLE column. zod's `.number()` rejects NaN by default but allows
// `Infinity` / `-Infinity` — and the coerce path turns the string
// `"Infinity"` into the float. An `inf` qty silently corrupts every
// downstream consumer that does arithmetic against it (PO line
// receiving, inventory-transaction net-position, valuation reports).
//
// Add `.finite()` at the boundary. Zero stays valid (a stocked item
// momentarily at 0 on-hand) and negatives stay valid (backorders, or
// historical fractional reconciliation entries that some accounting
// flows allow). Mirrors the polQtyField / polPriceField validators
// from #194 and btHourlyRateField from #206.
const invitQtyField = z.coerce.number().finite({
    message: 'invitQty must be a finite number.',
});

const createInventoryItemBody = z.object({
    invitDescription: z.string().min(1).max(1000),
    invitQty: invitQtyField,
    invitCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invitDescription, invitQty, invitCompId.',
});

const updateInventoryItemBody = z.object({
    invitDescription: z.string().min(1).max(1000).optional(),
    invitQty: invitQtyField.optional(),
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
