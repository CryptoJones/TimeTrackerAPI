// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** POST /v1/share/invoice/:id body (#438) — optional link lifetime. */
const shareCreateBody = z.object({
    expiresInSec: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: expiresInSec.',
});

/** GET /v1/share/invoice query (#438) — the signed token. */
const shareViewQuery = z.object({
    token: z.string().min(1).max(4096),
}).strict({
    message: 'Unexpected query parameter. Allowed: token.',
});

module.exports = { intIdParam, shareCreateBody, shareViewQuery };
