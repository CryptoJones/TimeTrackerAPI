// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const password = z.string().min(8).max(200);

/**
 * POST /v1/user body. Email + password required; userCompId optional for
 * non-master keys (defaults to the key's company), required for master.
 */
const createUserBody = z.object({
    userEmail: z.string().email().max(320),
    password: password,
    userName: z.string().min(1).max(255).optional(),
    userCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: userEmail, password, userName, userCompId.',
});

/** PATCH /v1/user/:id — userCompId is not patchable; password optional (re-hash). */
const updateUserBody = z.object({
    userEmail: z.string().email().max(320).optional(),
    userName: z.string().min(1).max(255).nullable().optional(),
    password: password.optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: userEmail, userName, password.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createUserBody,
    updateUserBody,
    listByCompanyQuery,
};
