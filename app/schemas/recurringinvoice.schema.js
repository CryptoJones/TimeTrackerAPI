// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');
const { CADENCES } = require('../services/recurring-schedule.js');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.');
const cadence = z.enum(CADENCES);

/** POST /v1/recurringinvoice body. */
const createRecurringInvoiceBody = z.object({
    recinvCustId: z.coerce.number().int().positive(),
    recinvCadence: cadence,
    recinvNextRun: isoDate,
    recinvNote: z.string().max(10000).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: recinvCustId, recinvCadence, recinvNextRun, recinvNote.',
});

/** PATCH /v1/recurringinvoice/:id — recinvCustId is not re-parentable. */
const updateRecurringInvoiceBody = z.object({
    recinvCadence: cadence.optional(),
    recinvNextRun: isoDate.optional(),
    recinvActive: z.boolean().optional(),
    recinvNote: z.string().max(10000).nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: recinvCadence, recinvNextRun, recinvActive, recinvNote.',
});

const listByCustomerQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

/** GET /v1/recurringinvoice/due query. companyId required for master keys. */
const dueQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, limit, offset.',
});

module.exports = {
    intIdParam,
    createRecurringInvoiceBody,
    updateRecurringInvoiceBody,
    listByCustomerQuery,
    dueQuery,
};
