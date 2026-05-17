// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createCompanyBody = z.object({
    compName: z.string().min(1).max(255),
    compAddress1: z.string().max(255).optional(),
    compAddress2: z.string().max(255).optional(),
    compCity: z.string().max(255).optional(),
    compState: z.string().length(2).optional(),
    compZip: z.string().max(32).optional(),
    compPhone: z.string().max(32).optional(),
    compEmail: z.string().email().max(255).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: compName, compAddress1, compAddress2, compCity, compState, compZip, compPhone, compEmail.',
});

const updateCompanyBody = z.object({
    compName: z.string().min(1).max(255).optional(),
    compAddress1: z.string().max(255).optional(),
    compAddress2: z.string().max(255).optional(),
    compCity: z.string().max(255).optional(),
    compState: z.string().length(2).optional(),
    compZip: z.string().max(32).optional(),
    compPhone: z.string().max(32).optional(),
    compEmail: z.string().email().max(255).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: compName, compAddress1, compAddress2, compCity, compState, compZip, compPhone, compEmail.',
});

const listQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createCompanyBody,
    updateCompanyBody,
    listQuery,
};
