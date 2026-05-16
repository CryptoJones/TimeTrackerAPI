// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/**
 * Body schema for POST /v1/customer.
 *
 * Whitelist semantics: any field not listed here is stripped via
 * .strip() (zod's default). Server-managed fields (custId, custArch)
 * are NOT accepted from the body at all.
 *
 * teCompId is optional here because the controller may default it
 * to the authKey's owning company for non-master keys. Master keys
 * must supply it; the controller enforces that separately so it
 * can emit a 400 with the contextual message rather than a generic
 * zod issue.
 */
const createCustomerBody = z.object({
    custCompanyName: z.string().max(255).optional(),
    custFName: z.string().max(255).optional(),
    custLName: z.string().max(255).optional(),
    custAddress1: z.string().max(255).optional(),
    custAddress2: z.string().max(255).optional(),
    custCity: z.string().max(255).optional(),
    custState: z.string().max(255).optional(),
    custZip: z.string().max(32).optional(),
    custPhone: z.string().max(64).optional(),
    custEmail: z.string().email().max(255).optional(),
    custCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: custCompanyName, custFName, custLName, custAddress1, custAddress2, custCity, custState, custZip, custPhone, custEmail, custCompId.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createCustomerBody,
    listByCompanyQuery,
};
