// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** POST /v1/apikey body — provision a key for a company. */
const createApiKeyBody = z.object({
    akCompanyId: z.coerce.number().int().positive(),
}).strict({
    message: 'Unexpected field in body. Whitelist: akCompanyId.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createApiKeyBody,
    listByCompanyQuery,
};
