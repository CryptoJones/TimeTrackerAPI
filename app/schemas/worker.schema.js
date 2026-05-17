// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/**
 * POST /v1/worker body. workerCompId is optional for non-master keys
 * (defaults to authKey's company) and required for master keys
 * (controller enforces). workerFName / workerLName / workerTitle /
 * workerDefaultBillType are required.
 *
 * Server-managed fields (workerId, workerArch) are not accepted.
 */
const createWorkerBody = z.object({
    workerFName: z.string().min(1).max(255),
    workerLName: z.string().min(1).max(255),
    workerTitle: z.string().min(1).max(255),
    workerDefaultBillType: z.coerce.number().int().positive(),
    workerCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: workerFName, workerLName, workerTitle, workerDefaultBillType, workerCompId.',
});

/**
 * PATCH /v1/worker/:id body. None of the fields are required —
 * a PATCH is a partial update — but at least one must be present.
 * workerCompId is not patchable (would amount to "move worker to
 * another company"; out of scope and would break auth invariants).
 */
const updateWorkerBody = z.object({
    workerFName: z.string().min(1).max(255).optional(),
    workerLName: z.string().min(1).max(255).optional(),
    workerTitle: z.string().min(1).max(255).optional(),
    workerDefaultBillType: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: workerFName, workerLName, workerTitle, workerDefaultBillType.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createWorkerBody,
    updateWorkerBody,
    listByCompanyQuery,
};
