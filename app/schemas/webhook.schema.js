// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');
const { WEBHOOK_EVENTS } = require('../services/webhook-signer.js');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

// Pin the scheme to http(s) at registration time (defense-in-depth; the
// send-time SSRF guard in ssrf-guard.js is the real choke point and also
// blocks private/loopback/link-local destinations + redirects to them).
const url = z.string().url().max(2048)
    .refine((s) => /^https?:\/\//i.test(s), { message: 'whkUrl must be an http(s) URL.' });
const event = z.enum(WEBHOOK_EVENTS);
const secret = z.string().min(8).max(255);

/**
 * POST /v1/webhook body. whkUrl + whkEvent required; whkCompId optional
 * for non-master keys (defaults to the key's company), required for master.
 */
const createWebhookBody = z.object({
    whkUrl: url,
    whkEvent: event,
    whkSecret: secret.optional(),
    whkCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: whkUrl, whkEvent, whkSecret, whkCompId.',
});

/** PATCH /v1/webhook/:id — whkCompId is not patchable. */
const updateWebhookBody = z.object({
    whkUrl: url.optional(),
    whkEvent: event.optional(),
    whkSecret: secret.nullable().optional(),
    whkActive: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: whkUrl, whkEvent, whkSecret, whkActive.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

module.exports = {
    intIdParam,
    createWebhookBody,
    updateWebhookBody,
    listByCompanyQuery,
};
