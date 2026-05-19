// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// PO-line quantity + per-unit price. Both are stored as Sequelize
// DOUBLE columns. zod's `.number()` rejects NaN by default but lets
// `Infinity` / `-Infinity` slip through — and the coerce path turns
// the string `"Infinity"` into the float. An `inf` in either column
// would silently corrupt every downstream calculation (PO totals,
// inventory valuation, reconciliation reports). Pin both to finite
// real numbers at the boundary.
//
// Zero and negative values still pass — a $0 line is a real "freebie
// included with order" case; a negative line can be used for an
// inline credit/discount entry on the PO. Mirrors the cpayAmount /
// injbAmount validators (#172 / #180).
const polQtyField = z.coerce.number().finite({
    message: 'polQty must be a finite number.',
});
const polPriceField = z.coerce.number().finite({
    message: 'polPrice must be a finite number.',
});

const createBody = z.object({
    polpoh: z.coerce.number().int().positive(),
    polItemDesc: z.string().min(1).max(1000),
    polQty: polQtyField,
    polPrice: polPriceField,
    polInvtId: z.coerce.number().int().positive(),
}).strict({
    message: 'Unexpected field in body. Whitelist: polpoh, polItemDesc, polQty, polPrice, polInvtId.',
});

const updateBody = z.object({
    polItemDesc: z.string().min(1).max(1000).optional(),
    polQty: polQtyField.optional(),
    polPrice: polPriceField.optional(),
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
