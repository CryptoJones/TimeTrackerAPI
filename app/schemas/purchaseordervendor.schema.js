// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// Shared shape — both create and update use the same field whitelist,
// but create requires the NOT-NULL columns while update treats every
// field as optional.
const baseFields = {
    povName:             z.string().min(1).max(255),
    povMailingAddress1:  z.string().min(1).max(255),
    povMailingAddress2:  z.string().max(255).optional(),
    povMailingCity:      z.string().min(1).max(255),
    povMailingState:     z.string().max(255).optional(),
    povMailingCountry:   z.string().max(255).optional(),
    povMailingZip:       z.string().max(32).optional(),
    povBillingAddress1:  z.string().max(255).optional(),
    povBillingAddress2:  z.string().max(255).optional(),
    povBillingCity:      z.string().max(255).optional(),
    povBillingState:     z.string().max(255).optional(),
    povBillingCountry:   z.string().max(255).optional(),
    povBillingZip:       z.string().max(32).optional(),
    povPhone:            z.string().max(64).optional(),
    povEMail:            z.string().email().max(255).optional(),
    povCompId:           z.coerce.number().int().positive().optional(),
};

const createBody = z.object(baseFields).strict({
    message: 'Unexpected field in body. See OpenAPI spec for the whitelist.',
});

// PATCH variant — all fields optional, including the ones that are
// NOT NULL on create.
const updateBody = z.object({
    ...Object.fromEntries(
        Object.entries(baseFields).map(([k, v]) => [k, v.optional()]),
    ),
}).strict({
    message: 'Unexpected field in body. See OpenAPI spec for the whitelist.',
}).omit({ povCompId: true });

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkBody = z.object({
    vendors: z.array(createBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: vendors (array).',
});

module.exports = {
    intIdParam,
    createBody,
    updateBody,
    listByCompanyQuery,
    bulkBody,
};
