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

// A payment amount must be a real, non-zero number. Zero is operator
// error (recording a "$0 payment" against a customer ledger has no
// business meaning); Infinity/-Infinity is data-quality error from
// pathological clients — `z.number()` rejects NaN but allows the
// infinities by default, and a DOUBLE column will happily store them.
// Negative values pass — some operators model refunds that way.
const cpayAmountField = z.coerce.number().finite({
    message: 'cpayAmount must be a finite number.',
}).refine((n) => n !== 0, {
    message: 'cpayAmount must not be zero.',
});

const createCustomerPaymentBody = z.object({
    cpayCustId: z.coerce.number().int().positive(),
    cpayInvId: z.coerce.number().int().positive().optional(),
    cpayDescription: z.string().max(10000).optional(),
    cpayDate: isoDate,
    cpayAmount: cpayAmountField,
}).strict({
    message: 'Unexpected field in body. Whitelist: cpayCustId, cpayInvId, cpayDescription, cpayDate, cpayAmount.',
});

const updateCustomerPaymentBody = z.object({
    // Nullable: pass null to de-allocate a payment (move it on-account).
    cpayInvId: z.coerce.number().int().positive().nullable().optional(),
    cpayDescription: z.string().max(10000).optional(),
    cpayDate: isoDate.optional(),
    cpayAmount: cpayAmountField.optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: cpayInvId, cpayDescription, cpayDate, cpayAmount.',
});

const listByCustomerQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkCustomerPaymentBody = z.object({
    customerPayments: z.array(createCustomerPaymentBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: customerPayments (array).',
});

module.exports = {
    intIdParam,
    createCustomerPaymentBody,
    updateCustomerPaymentBody,
    listByCustomerQuery,
    bulkCustomerPaymentBody,
};
