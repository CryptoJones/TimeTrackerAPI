// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');
const { ROLES } = require('../services/rbac.js');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** POST /v1/invitation body (#458). invtCompId optional (non-master → own; master required). */
const createInvitationBody = z.object({
    invtEmail: z.string().email().max(320),
    invtRole: z.enum(ROLES),
    invtCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: invtEmail, invtRole, invtCompId.',
});

/** POST /v1/invitation/accept body (#458) — public; provisions a user. */
const acceptInvitationBody = z.object({
    token: z.string().min(1).max(200),
    userName: z.string().min(1).max(255).optional(),
    password: z.string().min(8).max(200),
}).strict({
    message: 'Unexpected field in body. Whitelist: token, userName, password.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createInvitationBody,
    acceptInvitationBody,
    listByCompanyQuery,
};
