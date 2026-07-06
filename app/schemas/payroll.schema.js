// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.');

/** GET /v1/payroll/export|summary query. from/to required; companyId for master keys. */
const payrollQuery = z.object({
    from: isoDate,
    to: isoDate,
    companyId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: from, to, companyId.',
});

module.exports = { payrollQuery };
