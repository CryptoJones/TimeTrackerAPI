// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');
const { ROLES } = require('../services/rbac.js');
const { MAX_LEVELS } = require('../services/approval-chain.js');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const levelItem = z.object({
    approverRole: z.enum(ROLES),
}).strict({ message: 'Each level allows only: approverRole.' });

const levels = z.array(levelItem).min(1).max(MAX_LEVELS);

/** POST /v1/approvalchain body (#443). apchCompId optional (non-master → own; master required). */
const createApprovalChainBody = z.object({
    apchName: z.string().min(1).max(255),
    apchLevels: levels,
    apchCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: apchName, apchLevels, apchCompId.',
});

/** PATCH /v1/approvalchain/:id — apchCompId is not patchable. */
const updateApprovalChainBody = z.object({
    apchName: z.string().min(1).max(255).optional(),
    apchLevels: levels.optional(),
    apchActive: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: apchName, apchLevels, apchActive.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

/** GET /v1/approvalchain/:id/next query — how many approvals recorded, + optional actor role. */
const nextQuery = z.object({
    approvals: z.coerce.number().int().nonnegative(),
    actorRole: z.enum(ROLES).optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: approvals, actorRole.',
});

module.exports = {
    intIdParam,
    createApprovalChainBody,
    updateApprovalChainBody,
    listByCompanyQuery,
    nextQuery,
};
