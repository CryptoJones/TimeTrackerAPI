// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** POST /v1/task body. taskJobId + taskName required. */
const createTaskBody = z.object({
    taskJobId: z.coerce.number().int().positive(),
    taskName: z.string().min(1).max(255),
    taskDesc: z.string().max(10000).optional(),
    taskRate: z.coerce.number().positive().max(999999999.99).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: taskJobId, taskName, taskDesc, taskRate.',
});

/** PATCH /v1/task/:id body — taskJobId is not re-parentable here. */
const updateTaskBody = z.object({
    taskName: z.string().min(1).max(255).optional(),
    taskDesc: z.string().max(10000).nullable().optional(),
    taskRate: z.coerce.number().positive().max(999999999.99).nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: taskName, taskDesc, taskRate.',
});

const listByJobQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createTaskBody,
    updateTaskBody,
    listByJobQuery,
};
