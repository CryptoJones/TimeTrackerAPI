// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

/**
 * GET /v1/report/invoice-list query. Reproduces the source
 * `v_InvoiceList` view (Invoices × Customers × InvoiceJobs). Auth shape
 * mirrors the export endpoints: master keys must pass `companyId`,
 * non-master keys are auto-scoped (and may pass their own id but not
 * another). Optional `customerId` narrows to a single customer.
 */
const invoiceListQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, limit, offset.',
});

/**
 * GET /v1/report/invoice-list.csv query. Same as the JSON variant but
 * bumps the limit cap to 5000 to match the CSV body's hard cap.
 */
const invoiceListCsvQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(5000).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, limit, offset.',
});

module.exports = {
    invoiceListQuery,
    invoiceListCsvQuery,
};
