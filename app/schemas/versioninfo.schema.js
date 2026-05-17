// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const isoDatetime = z.string().datetime({
    offset: true,
    message: 'Must be an ISO 8601 datetime.',
});

const createVersionInfoBody = z.object({
    viVersion: z.string().min(1).max(255),
    viDate: isoDatetime,
}).strict({
    message: 'Unexpected field in body. Whitelist: viVersion, viDate.',
});

const updateVersionInfoBody = z.object({
    viVersion: z.string().min(1).max(255).optional(),
    viDate: isoDatetime.optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: viVersion, viDate.',
});

const listQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createVersionInfoBody,
    updateVersionInfoBody,
    listQuery,
};
