// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const isoDatetime = z.string().datetime({
    offset: true,
    message: 'Must be an ISO 8601 datetime (e.g. 2026-05-16T09:00:00Z).',
});

/**
 * POST /v1/timeentry body. teCompId is optional for non-master keys
 * (defaults to authKey's company) and required for master keys
 * (controller enforces). teCustId + teStartedAt are required;
 * teEndedAt is optional (in-flight entries allowed).
 *
 * Server-managed fields (teId, teMinutes, teArch) are not accepted
 * from the body.
 */
const createTimeEntryBody = z.object({
    teCustId: z.coerce.number().int().positive(),
    teCompId: z.coerce.number().int().positive().optional(),
    teDescription: z.string().max(10000).optional(),
    teStartedAt: isoDatetime,
    teEndedAt: isoDatetime.optional(),
    teBillable: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: teCustId, teCompId, teDescription, teStartedAt, teEndedAt, teBillable.',
});

/**
 * PATCH /v1/timeentry/:id body. None of the fields are required —
 * a PATCH is a partial update — but at least one must be present.
 * The controller already handles the "no updatable fields" case
 * with a 400; the schema just enforces shape.
 */
const updateTimeEntryBody = z.object({
    teDescription: z.string().max(10000).optional(),
    teStartedAt: isoDatetime.optional(),
    teEndedAt: isoDatetime.nullable().optional(),
    teBillable: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: teDescription, teStartedAt, teEndedAt, teBillable.',
});

/**
 * GET /v1/timeentry/export.csv query schema. Like listByCompanyQuery
 * but adds companyId (required for master) and bumps the limit cap
 * to 5000 to match the CSV body's hard cap.
 */
const exportCsvQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    from: isoDatetime.optional(),
    to: isoDatetime.optional(),
    limit: z.coerce.number().int().positive().max(5000).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, customerId, from, to, limit, offset.',
});

const listByCompanyQuery = z.object({
    customerId: z.coerce.number().int().positive().optional(),
    from: isoDatetime.optional(),
    to: isoDatetime.optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: customerId, from, to, limit, offset.',
});

module.exports = {
    intIdParam,
    createTimeEntryBody,
    updateTimeEntryBody,
    listByCompanyQuery,
    exportCsvQuery,
};
