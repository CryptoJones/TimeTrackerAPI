// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// Invoice-numbering config (#390): a bounded prefix, a zero-pad width,
// and an operator-settable next counter (to start/reset the sequence).
const invNumberingFields = {
    compInvPrefix: z.string().max(16).optional(),
    compInvPad: z.coerce.number().int().min(0).max(12).optional(),
    compInvNextSeq: z.coerce.number().int().positive().optional(),
    compTaxRate: z.coerce.number().min(0).max(1).optional(),
    compInvFooter: z.string().max(2000).optional(),
};
const NUMBERING_WHITELIST = ', compInvPrefix, compInvPad, compInvNextSeq, compTaxRate, compInvFooter';

const createCompanyBody = z.object({
    compName: z.string().min(1).max(255),
    compAddress1: z.string().max(255).optional(),
    compAddress2: z.string().max(255).optional(),
    compCity: z.string().max(255).optional(),
    compState: z.string().length(2).optional(),
    compZip: z.string().max(32).optional(),
    compPhone: z.string().max(32).optional(),
    compEmail: z.string().email().max(255).optional(),
    ...invNumberingFields,
}).strict({
    message: 'Unexpected field in body. Whitelist: compName, compAddress1, compAddress2, compCity, compState, compZip, compPhone, compEmail' + NUMBERING_WHITELIST + '.',
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
    ...invNumberingFields,
}).strict({
    message: 'Unexpected field in body. Whitelist: compName, compAddress1, compAddress2, compCity, compState, compZip, compPhone, compEmail' + NUMBERING_WHITELIST + '.',
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
