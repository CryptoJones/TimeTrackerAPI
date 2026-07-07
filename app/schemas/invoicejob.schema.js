// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// `injbAmount` is the per-line monetary value on an invoice. zod's
// `.number()` rejects NaN by default but allows Infinity / -Infinity
// through, and although the column is now NUMERIC(14,2), an `inf`
// still overflows money.toCents() and contaminates any consumer doing arithmetic
// (invoice totals, aging buckets, CSV exports). Pin to finite real
// numbers at the boundary. Zero and negative values still pass (a
// $0 reference line and a credit/discount line are both real
// accounting uses).
// Bound the magnitude (negatives allowed — a credit/discount line): an
// unbounded but finite value (e.g. 1e308) survives `.finite()` and later
// overflows money.toCents() to Infinity, throwing uncaught in the invoice
// total / aging / PDF consumers (a 500).
const injbAmountField = z.coerce.number().finite({
    message: 'injbAmount must be a finite number.',
}).min(-999999999.99).max(999999999.99);

const createInvoiceJobBody = z.object({
    injbInvId: z.coerce.number().int().positive(),
    injbJobId: z.coerce.number().int().positive(),
    injbAmount: injbAmountField,
}).strict({
    message: 'Unexpected field in body. Whitelist: injbInvId, injbJobId, injbAmount.',
});

const updateInvoiceJobBody = z.object({
    injbAmount: injbAmountField.optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: injbAmount.',
});

const listByInvoiceQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkInvoiceJobBody = z.object({
    invoiceJobs: z.array(createInvoiceJobBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: invoiceJobs (array).',
});

module.exports = {
    intIdParam,
    createInvoiceJobBody,
    updateInvoiceJobBody,
    listByInvoiceQuery,
    bulkInvoiceJobBody,
};
