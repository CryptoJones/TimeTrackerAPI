// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createInvoiceJobBody = z.object({
    injbInvId: z.coerce.number().int().positive(),
    injbJobId: z.coerce.number().int().positive(),
    injbAmount: z.coerce.number(),
}).strict({
    message: 'Unexpected field in body. Whitelist: injbInvId, injbJobId, injbAmount.',
});

const updateInvoiceJobBody = z.object({
    injbAmount: z.coerce.number().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: injbAmount.',
});

const listByInvoiceQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createInvoiceJobBody,
    updateInvoiceJobBody,
    listByInvoiceQuery,
};
