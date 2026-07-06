// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * webhook-signer.js — pure helpers for outbound webhooks (#69).
 *
 * The set of subscribable events, the delivery envelope, and the
 * HMAC-SHA256 signature. No network, no DB — trivially unit-testable.
 */

const crypto = require('crypto');

// Events a webhook may subscribe to. '*' subscribes to every event.
const WEBHOOK_EVENTS = ['invoice.created', 'payment.recorded', 'timeentry.approved', '*'];

/** The JSON envelope delivered to a webhook. */
function buildEvent(event, data, timestamp) {
    return { event, timestamp: timestamp || null, data: data == null ? null : data };
}

/**
 * Sign a serialized body with the webhook secret.
 * @returns {string} 'sha256=<hex>' (empty string when no secret is set).
 */
function signPayload(secret, body) {
    if (!secret) return '';
    return 'sha256=' + crypto.createHmac('sha256', String(secret)).update(String(body)).digest('hex');
}

module.exports = { WEBHOOK_EVENTS, buildEvent, signPayload };
