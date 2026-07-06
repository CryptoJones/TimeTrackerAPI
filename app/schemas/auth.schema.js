// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

/** POST /v1/login body — sign in a user within a company (#445). */
const loginBody = z.object({
    userEmail: z.string().email().max(320),
    password: z.string().min(1).max(200),
    companyId: z.coerce.number().int().positive(),
}).strict({
    message: 'Unexpected field in body. Whitelist: userEmail, password, companyId.',
});

/** POST /v1/password-reset/request body (#446). */
const requestResetBody = z.object({
    userEmail: z.string().email().max(320),
    companyId: z.coerce.number().int().positive(),
}).strict({
    message: 'Unexpected field in body. Whitelist: userEmail, companyId.',
});

/** POST /v1/password-reset/confirm body (#446). */
const confirmResetBody = z.object({
    token: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
}).strict({
    message: 'Unexpected field in body. Whitelist: token, newPassword.',
});

module.exports = {
    loginBody,
    requestResetBody,
    confirmResetBody,
};
