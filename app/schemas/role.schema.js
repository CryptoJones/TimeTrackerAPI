// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/**
 * POST /v1/role body. roleName required; roleCompId optional for
 * non-master keys (defaults to the key's company), required for master.
 */
const createRoleBody = z.object({
    roleName: z.string().min(1).max(255),
    roleRate: z.coerce.number().positive().max(999999999.99).optional(),
    roleCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: roleName, roleRate, roleCompId.',
});

/** PATCH /v1/role/:id — roleCompId is not patchable. */
const updateRoleBody = z.object({
    roleName: z.string().min(1).max(255).optional(),
    roleRate: z.coerce.number().positive().max(999999999.99).nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: roleName, roleRate.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createRoleBody,
    updateRoleBody,
    listByCompanyQuery,
};
