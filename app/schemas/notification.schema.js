// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');
const { CHANNELS } = require('../services/notifier.js');

/** POST /v1/notification/test body — send a test email to verify delivery. */
const testNotificationBody = z.object({
    to: z.string().email(),
    subject: z.string().min(1).max(255).optional(),
    text: z.string().max(10000).optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: to, subject, text.',
});

/** POST /v1/notification/dispatch body — Slack/Teams notification (#454). */
const notifyBody = z.object({
    channel: z.enum(CHANNELS),
    text: z.string().min(1).max(2000),
}).strict({
    message: 'Unexpected field in body. Whitelist: channel, text.',
});

module.exports = {
    testNotificationBody,
    notifyBody,
};
