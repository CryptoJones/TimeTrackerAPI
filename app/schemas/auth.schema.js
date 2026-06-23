// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');

const signupBody = z.object({
    email: z.string().email().max(320),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
    companyName: z.string().min(1).max(128).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: email, password, companyName.',
});

const loginBody = z.object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(200),
}).strict({
    message: 'Unexpected field in body. Whitelist: email, password.',
});

module.exports = { signupBody, loginBody };
