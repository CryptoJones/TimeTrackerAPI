// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createBody = z.object({
    invtDirection: z.union([z.literal(0), z.literal(1)]),
    invtInitId: z.coerce.number().int().positive(),
    invtCompanyId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invtDirection (0|1), invtInitId, invtCompanyId.',
});

// PATCH typically wouldn't be allowed on a financial movement log —
// reversing entries are the normal pattern. But we expose it for
// parity with the rest of the API surface. invtCompanyId is not
// patchable (would break auth invariants).
const updateBody = z.object({
    invtDirection: z.union([z.literal(0), z.literal(1)]).optional(),
    invtInitId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invtDirection, invtInitId.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createBody,
    updateBody,
    listByCompanyQuery,
};
