// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** GET /v1/auditlog/bycompany/:id query — optional filters + pagination.
 *  DCAA filters (#462): entityId, actor, from/to date range. */
const listQuery = z.object({
    method: z.enum(['POST', 'PATCH', 'PUT', 'DELETE']).optional(),
    entity: z.string().min(1).max(40).optional(),
    entityId: z.coerce.number().int().positive().optional(),
    actor: z.string().min(1).max(64).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.').optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: method, entity, entityId, actor, from, to, limit, offset.',
});

module.exports = { intIdParam, listQuery };
