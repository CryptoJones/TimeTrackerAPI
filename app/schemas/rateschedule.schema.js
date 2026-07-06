// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.');

function refineToAfterFrom(d) {
    if (!d.rschEffectiveFrom || !d.rschEffectiveTo) return true;
    return d.rschEffectiveTo >= d.rschEffectiveFrom;
}
const TO_BEFORE_FROM = { message: 'rschEffectiveTo must be on or after rschEffectiveFrom.', path: ['rschEffectiveTo'] };

/**
 * POST /v1/rateschedule body. Name + rate + effectiveFrom required;
 * rschCompId optional for non-master keys, required for master.
 */
const createRateScheduleBody = z.object({
    rschName: z.string().min(1).max(255),
    rschRate: z.coerce.number().positive().max(999999999.99),
    rschEffectiveFrom: isoDate,
    rschEffectiveTo: isoDate.optional(),
    rschCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: rschName, rschRate, rschEffectiveFrom, rschEffectiveTo, rschCompId.',
}).refine(refineToAfterFrom, TO_BEFORE_FROM);

/** PATCH /v1/rateschedule/:id — rschCompId is not patchable. */
const updateRateScheduleBody = z.object({
    rschName: z.string().min(1).max(255).optional(),
    rschRate: z.coerce.number().positive().max(999999999.99).optional(),
    rschEffectiveFrom: isoDate.optional(),
    rschEffectiveTo: isoDate.nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: rschName, rschRate, rschEffectiveFrom, rschEffectiveTo.',
}).refine(refineToAfterFrom, TO_BEFORE_FROM);

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

/** GET /v1/rateschedule/resolve query. date required; companyId for master keys. */
const resolveQuery = z.object({
    date: isoDate,
    companyId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: date, companyId.',
});

module.exports = {
    intIdParam,
    createRateScheduleBody,
    updateRateScheduleBody,
    listByCompanyQuery,
    resolveQuery,
};
