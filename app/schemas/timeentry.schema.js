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
 *
 * Cross-field refinement: when both teStartedAt and teEndedAt are
 * present, teEndedAt must be at or after teStartedAt. The controller
 * already maps an inverted range to `teMinutes = null` silently, but
 * the user has no signal that their request was nonsense — they
 * still get a 201 with bad data. Reject at the boundary instead.
 */
const createTimeEntryBody = z.object({
    teCustId: z.coerce.number().int().positive(),
    teCompId: z.coerce.number().int().positive().optional(),
    teDescription: z.string().max(10000).optional(),
    teStartedAt: isoDatetime,
    teEndedAt: isoDatetime.optional(),
    teBillable: z.boolean().optional(),
    // Optional restored relationships — the controller scopes each to
    // the caller's company when present (non-master keys).
    teJobId: z.coerce.number().int().positive().optional(),
    teWorkerId: z.coerce.number().int().positive().optional(),
    teBillTypeId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: teCustId, teCompId, teDescription, teStartedAt, teEndedAt, teBillable, teJobId, teWorkerId, teBillTypeId.',
}).refine(
    (data) => !data.teEndedAt || new Date(data.teEndedAt) >= new Date(data.teStartedAt),
    {
        message: 'teEndedAt must be at or after teStartedAt.',
        path: ['teEndedAt'],
    },
);

/**
 * PATCH /v1/timeentry/:id body. None of the fields are required —
 * a PATCH is a partial update — but at least one must be present.
 * The controller already handles the "no updatable fields" case
 * with a 400; the schema just enforces shape.
 *
 * Cross-field refinement: when both teStartedAt and teEndedAt are
 * present in the same PATCH, the same end >= start constraint as
 * CREATE applies. (The single-field PATCH case — updating only one
 * bound against the DB's existing value — has to be enforced at
 * the controller layer because the schema doesn't see the existing
 * row; controller already returns `teMinutes = null` there.)
 */
const updateTimeEntryBody = z.object({
    teDescription: z.string().max(10000).optional(),
    teStartedAt: isoDatetime.optional(),
    teEndedAt: isoDatetime.nullable().optional(),
    teBillable: z.boolean().optional(),
    // Nullable so a PATCH can detach a job/worker/rate (set to null).
    teJobId: z.coerce.number().int().positive().nullable().optional(),
    teWorkerId: z.coerce.number().int().positive().nullable().optional(),
    teBillTypeId: z.coerce.number().int().positive().nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: teDescription, teStartedAt, teEndedAt, teBillable, teJobId, teWorkerId, teBillTypeId.',
}).refine(
    (data) => !(data.teStartedAt && data.teEndedAt) ||
        new Date(data.teEndedAt) >= new Date(data.teStartedAt),
    {
        message: 'teEndedAt must be at or after teStartedAt.',
        path: ['teEndedAt'],
    },
);

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
