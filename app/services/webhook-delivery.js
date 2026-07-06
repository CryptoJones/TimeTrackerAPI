// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * webhook-delivery.js — POST an event to a webhook endpoint (#69).
 *
 * Best-effort: never throws, always resolves to a result object. Uses
 * the global fetch (Node 18+) with a short timeout so a slow or dead
 * endpoint can't stall the request. Signing/enveloping live in
 * webhook-signer.js (pure); this module owns the network side effect.
 */

const log = require('../config/logger.js');
const { buildEvent, signPayload } = require('./webhook-signer.js');
const { safeFetch } = require('./ssrf-guard.js');

const TIMEOUT_MS = 5000;

/**
 * Deliver `data` for `event` to `webhook`. Returns
 * { ok, status } on a completed request or { ok:false, error } otherwise.
 */
async function deliver(webhook, event, data) {
    const url = webhook && webhook.whkUrl;
    if (!url) return { ok: false, error: 'no url' };

    const payload = buildEvent(event, data, new Date().toISOString());
    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json', 'X-Webhook-Event': String(event) };
    const sig = signPayload(webhook.whkSecret, body);
    if (sig) headers['X-Webhook-Signature'] = sig;

    try {
        // safeFetch enforces the SSRF guard (scheme + resolved-IP denylist)
        // on the URL AND every redirect hop — a tenant can put any host in
        // whkUrl, so this must not reach loopback / link-local / private
        // ranges (e.g. cloud metadata at 169.254.169.254). See ssrf-guard.js.
        const res = await safeFetch(url, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return { ok: res.ok, status: res.status };
    } catch (error) {
        log.error({ err: error, whkId: webhook && webhook.whkId }, 'webhook delivery failed');
        return { ok: false, error: error && error.message ? error.message : 'delivery failed' };
    }
}

module.exports = { deliver };
