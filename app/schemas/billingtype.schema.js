// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// `btHourlyRate` is a Sequelize DOUBLE column for the hourly rate
// charged against a BillingType. `.nonnegative()` blocks negatives
// (a -$50/hr rate is operator error) but DOES NOT block `Infinity`
// — `Infinity >= 0` is true. The coerce path also turns the string
// `"Infinity"` into the float, so JSON without an Infinity literal
// can still land `inf` in the column and contaminate downstream
// invoice/time-entry totals.
//
// Chain `.finite()` ahead of `.nonnegative()` to reject the
// infinities. Zero remains a valid rate (pro-bono / internal-only
// billing entries). Mirrors the cpayAmount / injbAmount / polPrice
// validators (#172 / #180 / #194).
const btHourlyRateField = z.coerce.number()
    .finite({ message: 'btHourlyRate must be a finite number.' })
    .nonnegative();

const createBillingTypeBody = z.object({
    btName: z.string().min(1).max(255),
    btHourlyRate: btHourlyRateField,
    btCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: btName, btHourlyRate, btCompId.',
});

const updateBillingTypeBody = z.object({
    btName: z.string().min(1).max(255).optional(),
    btHourlyRate: btHourlyRateField.optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: btName, btHourlyRate.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

const bulkBillingTypeBody = z.object({
    billingTypes: z.array(createBillingTypeBody).min(1).max(500),
}).strict({
    message: 'Unexpected field in body. Whitelist: billingTypes (array).',
});

module.exports = {
    intIdParam,
    createBillingTypeBody,
    updateBillingTypeBody,
    listByCompanyQuery,
    bulkBillingTypeBody,
};
