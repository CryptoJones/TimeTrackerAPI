// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** GET /v1/auditlog/bycompany/:id query — optional filters + pagination. */
const listQuery = z.object({
    method: z.enum(['POST', 'PATCH', 'PUT', 'DELETE']).optional(),
    entity: z.string().min(1).max(40).optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: method, entity, limit, offset.',
});

module.exports = { intIdParam, listQuery };
