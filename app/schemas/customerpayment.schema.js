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

const createCustomerPaymentBody = z.object({
    cpayCustId: z.coerce.number().int().positive(),
    cpayDescription: z.string().max(10000).optional(),
    cpayDate: isoDate,
    cpayAmount: z.coerce.number(),
}).strict({
    message: 'Unexpected field in body. Whitelist: cpayCustId, cpayDescription, cpayDate, cpayAmount.',
});

const updateCustomerPaymentBody = z.object({
    cpayDescription: z.string().max(10000).optional(),
    cpayDate: isoDate.optional(),
    cpayAmount: z.coerce.number().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: cpayDescription, cpayDate, cpayAmount.',
});

const listByCustomerQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createCustomerPaymentBody,
    updateCustomerPaymentBody,
    listByCustomerQuery,
};
