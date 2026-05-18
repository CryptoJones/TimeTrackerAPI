// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const createBillingTypeBody = z.object({
    btName: z.string().min(1).max(255),
    btHourlyRate: z.coerce.number().nonnegative(),
    btCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: btName, btHourlyRate, btCompId.',
});

const updateBillingTypeBody = z.object({
    btName: z.string().min(1).max(255).optional(),
    btHourlyRate: z.coerce.number().nonnegative().optional(),
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
