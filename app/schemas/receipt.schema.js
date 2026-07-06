// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// Receipt file types accepted by the upload endpoint.
const CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

/**
 * POST /v1/receipt body (#419). The file is base64-encoded in JSON (the
 * effective max size is governed by the JSON_BODY_LIMIT env var — default
 * 100kb; raise it to accept larger uploads). The controller also caps the
 * DECODED size.
 */
const createReceiptBody = z.object({
    expId: z.coerce.number().int().positive(),
    filename: z.string().min(1).max(255),
    contentType: z.enum(CONTENT_TYPES),
    dataBase64: z.string().min(1).max(10_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Must be base64.'),
}).strict({
    message: 'Unexpected field in body. Whitelist: expId, filename, contentType, dataBase64.',
});

const listByExpenseQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createReceiptBody,
    listByExpenseQuery,
    CONTENT_TYPES,
};
