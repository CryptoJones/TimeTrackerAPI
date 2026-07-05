// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Must be an ISO 8601 date (YYYY-MM-DD).',
});

/**
 * GET /v1/report/unbilled query. companyId required for master keys
 * (controller enforces); scoped keys default to their own company.
 * Optional customerId filter and from/to date bounds on entry start.
 */
const unbilledQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, from, to.',
});

module.exports = { unbilledQuery };
