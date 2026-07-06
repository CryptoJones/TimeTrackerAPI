// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * notifier.js — Slack / Teams notification dispatch (#454). Mirrors
 * mailer.js: transport is pluggable and the DEFAULT is a no-network
 * "capture" transport that validates + records notifications (dev / CI /
 * unconfigured-prod safe — nothing leaves the process). A real transport
 * (an incoming-webhook POST to SLACK_WEBHOOK_URL / TEAMS_WEBHOOK_URL)
 * drops in behind the same `send(notification)` interface via
 * `setTransport()` — a config follow-up that adds no coupling here. This
 * gives the reminder features (approval / payment) a channel beyond email.
 */

const log = require('../config/logger.js');

const CHANNELS = ['slack', 'teams'];
const MAX_CAPTURED = 100;
const captured = [];

/** Channel-appropriate JSON body for a simple text message. */
function formatPayload(channel, text) {
    // Slack and Teams incoming webhooks both accept a top-level { text }.
    return { text: String(text == null ? '' : text) };
}

/** No-network transport: records the notification so it can be inspected/tested. */
function captureTransport() {
    return {
        name: 'capture',
        async send(n) {
            captured.push({ channel: n.channel, text: n.text, at: new Date().toISOString() });
            if (captured.length > MAX_CAPTURED) captured.shift();
            log.info({ channel: n.channel }, 'notification captured (no webhook transport configured)');
            return { delivered: true, transport: 'capture', channel: n.channel };
        },
    };
}

let _transport = captureTransport();

/** Swap the transport (e.g. a webhook adapter). Passing null restores capture. */
function setTransport(t) {
    _transport = (t && typeof t.send === 'function') ? t : captureTransport();
}

/** Name of the active transport (for diagnostics / the endpoint). */
function currentTransport() {
    return _transport && _transport.name ? _transport.name : 'unknown';
}

function validate(n) {
    if (!n || typeof n !== 'object') return 'notification is required';
    if (!CHANNELS.includes(n.channel)) return `channel must be one of ${CHANNELS.join(', ')}`;
    if (!n.text || !String(n.text).trim()) return 'text is required';
    return null;
}

/**
 * Dispatch (or capture) a notification. Rejects with an Error whose `code`
 * is 'NOTIFY_INVALID' on bad input, so callers can map it to a 400.
 * @param notification { channel, text }
 */
async function notify(notification) {
    const err = validate(notification);
    if (err) {
        const e = new Error(err);
        e.code = 'NOTIFY_INVALID';
        throw e;
    }
    return _transport.send({
        channel: notification.channel,
        text: notification.text,
        payload: formatPayload(notification.channel, notification.text),
    });
}

// Test seam — recent captured notifications (newest last).
function _captured() {
    return captured.slice();
}

module.exports = { CHANNELS, formatPayload, notify, setTransport, currentTransport, _captured };
