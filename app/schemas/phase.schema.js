// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// YYYY-MM-DD calendar date.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.');

/** POST /v1/phase body. phaseJobId + phaseName required. */
const createPhaseBody = z.object({
    phaseJobId: z.coerce.number().int().positive(),
    phaseName: z.string().min(1).max(255),
    phaseStartDate: isoDate.optional(),
    phaseEndDate: isoDate.optional(),
    phaseBudgetAmount: z.coerce.number().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: phaseJobId, phaseName, phaseStartDate, phaseEndDate, phaseBudgetAmount.',
}).refine(
    (d) => !(d.phaseStartDate && d.phaseEndDate) || d.phaseEndDate >= d.phaseStartDate,
    { message: 'phaseEndDate must be on or after phaseStartDate.', path: ['phaseEndDate'] },
);

/** PATCH /v1/phase/:id — phaseJobId is not re-parentable here. */
const updatePhaseBody = z.object({
    phaseName: z.string().min(1).max(255).optional(),
    phaseStartDate: isoDate.nullable().optional(),
    phaseEndDate: isoDate.nullable().optional(),
    phaseBudgetAmount: z.coerce.number().positive().nullable().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: phaseName, phaseStartDate, phaseEndDate, phaseBudgetAmount.',
}).refine(
    (d) => !(d.phaseStartDate && d.phaseEndDate) || d.phaseEndDate >= d.phaseStartDate,
    { message: 'phaseEndDate must be on or after phaseStartDate.', path: ['phaseEndDate'] },
);

const listByJobQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createPhaseBody,
    updatePhaseBody,
    listByJobQuery,
};
