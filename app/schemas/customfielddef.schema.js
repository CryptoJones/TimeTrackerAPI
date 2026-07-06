// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');
const { TYPES, ENTITIES } = require('../services/custom-field.js');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

/** POST /v1/customfield body (#409). cfdCompId optional (non-master → own; master required). */
const createCustomFieldDefBody = z.object({
    cfdEntity: z.enum(ENTITIES),
    cfdName: z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Must start with a letter; letters/digits/underscore only.'),
    cfdLabel: z.string().min(1).max(255).optional(),
    cfdType: z.enum(TYPES),
    cfdRequired: z.boolean().optional(),
    cfdCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: cfdEntity, cfdName, cfdLabel, cfdType, cfdRequired, cfdCompId.',
});

/** PATCH /v1/customfield/:id — cfdEntity + cfdCompId are not patchable. */
const updateCustomFieldDefBody = z.object({
    cfdName: z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
    cfdLabel: z.string().min(1).max(255).nullable().optional(),
    cfdType: z.enum(TYPES).optional(),
    cfdRequired: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: cfdName, cfdLabel, cfdType, cfdRequired.',
});

const listByCompanyQuery = z.object({
    entity: z.enum(ENTITIES).optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: entity, limit, offset.',
});

/** POST /v1/customfield/validate body — check a values object against the defs. */
const validateBody = z.object({
    entity: z.enum(ENTITIES),
    values: z.record(z.any()),
    companyId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: entity, values, companyId.',
});

module.exports = {
    intIdParam,
    createCustomFieldDefBody,
    updateCustomFieldDefBody,
    listByCompanyQuery,
    validateBody,
};
