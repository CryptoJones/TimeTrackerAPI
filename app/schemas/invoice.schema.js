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

const createInvoiceBody = z.object({
    invCustId: z.coerce.number().int().positive(),
    invDate: isoDate,
    invDueDate: isoDate,
    invPaid: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invCustId, invDate, invDueDate, invPaid.',
});

const updateInvoiceBody = z.object({
    invDate: isoDate.optional(),
    invDueDate: isoDate.optional(),
    invPaid: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invDate, invDueDate, invPaid.',
});

const listByCustomerQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkInvoiceBody = z.object({
    invoices: z.array(createInvoiceBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: invoices (array).',
});

module.exports = {
    intIdParam,
    createInvoiceBody,
    updateInvoiceBody,
    listByCustomerQuery,
    bulkInvoiceBody,
};
