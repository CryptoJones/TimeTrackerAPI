// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// Bounded like every other money field (max 999,999,999.99) so an absurd
// amount returns a clean 400 instead of overflowing NUMERIC(14,2) → 500, and
// never overflows money.toCents. Covers both retAmount (create) and the
// drawdown amount.
const positiveAmount = z.coerce.number().finite().positive()
    .max(999999999.99, { message: 'amount is out of range (max 999,999,999.99).' });

/** POST /v1/retainer body. retCustId + retAmount required. */
const createRetainerBody = z.object({
    retCustId: z.coerce.number().int().positive(),
    retAmount: positiveAmount,
    retNote: z.string().max(10000).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: retCustId, retAmount, retNote.',
});

/** PATCH /v1/retainer/:id — only the note is editable; balance moves via drawdown. */
const updateRetainerBody = z.object({
    retNote: z.string().max(10000).nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: retNote.',
});

/** POST /v1/retainer/:id/drawdown body. */
const drawdownBody = z.object({
    amount: positiveAmount,
}).strict({
    message: 'Body must be { amount: <positive number> }.',
});

const listByCustomerQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createRetainerBody,
    updateRetainerBody,
    drawdownBody,
    listByCustomerQuery,
};
