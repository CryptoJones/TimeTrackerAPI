// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const isoDatetime = z.string().datetime({
    offset: true,
    message: 'Must be an ISO 8601 datetime.',
});

const createBody = z.object({
    pohDate: isoDatetime,
    pohReference: z.string().min(1).max(255),
    pohTerms: z.string().min(1).max(1000),
    pohPovId: z.coerce.number().int().positive(),
}).strict({
    message: 'Unexpected field in body. Whitelist: pohDate, pohReference, pohTerms, pohPovId.',
});

const updateBody = z.object({
    pohDate: isoDatetime.optional(),
    pohReference: z.string().min(1).max(255).optional(),
    pohTerms: z.string().min(1).max(1000).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: pohDate, pohReference, pohTerms.',
});

const listByVendorQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkBody = z.object({
    purchaseOrderHeaders: z.array(createBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: purchaseOrderHeaders (array).',
});

module.exports = {
    intIdParam,
    createBody,
    updateBody,
    listByVendorQuery,
    bulkBody,
};
