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
    workerTargetMinsPerWeek: z.coerce.number().int().positive().optional(),
    workerCostRate: z.coerce.number().positive().max(999999999.99).optional(),
    workerRoleId: z.coerce.number().int().positive().optional(),
    workerUserId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: workerFName, workerLName, workerTitle, workerDefaultBillType, workerCompId, workerTargetMinsPerWeek, workerCostRate, workerRoleId, workerUserId.',
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
    workerTargetMinsPerWeek: z.coerce.number().int().positive().nullable().optional(),
    workerCostRate: z.coerce.number().positive().max(999999999.99).nullable().optional(),
    workerRoleId: z.coerce.number().int().positive().nullable().optional(),
    workerUserId: z.coerce.number().int().positive().nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: workerFName, workerLName, workerTitle, workerDefaultBillType, workerTargetMinsPerWeek, workerCostRate, workerRoleId, workerUserId.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

/**
 * POST /v1/worker/bulk body. Mirrors customer's bulk shape. Each entry
 * is validated by the same createWorkerBody so the whitelist semantics
 * stay uniform between single and bulk paths.
 */
const bulkWorkerBody = z.object({
    workers: z.array(createWorkerBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: workers (array).',
});

module.exports = {
    intIdParam,
    createWorkerBody,
    updateWorkerBody,
    listByCompanyQuery,
    bulkWorkerBody,
};
