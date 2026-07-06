// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * mailer.js — the email/notification service (#68). Foundational for
 * approval/payment reminders and scheduled report delivery: those
 * features call `sendMail(...)` and stay decoupled from the transport.
 *
 * Transport is pluggable. The DEFAULT is a no-network "capture" transport
 * that validates + records messages (dev/CI/unconfigured-prod safe —
 * nothing is actually emailed). A real SMTP transport drops in behind the
 * same `send(message)` interface via `setTransport()` (e.g. a thin
 * nodemailer adapter wired from SMTP_* env vars — a config follow-up that
 * adds no coupling here).
 */

const log = require('../config/logger.js');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_CAPTURED = 100;
const captured = [];

/** No-network transport: records the message so it can be inspected/tested. */
function captureTransport() {
    return {
        name: 'capture',
        async send(message) {
            captured.push({ to: message.to, subject: message.subject, at: new Date().toISOString() });
            if (captured.length > MAX_CAPTURED) captured.shift();
            log.info({ to: message.to, subject: message.subject }, 'email captured (no SMTP transport configured)');
            return { accepted: [message.to], transport: 'capture' };
        },
    };
}

let _transport = captureTransport();

/** Swap the transport (e.g. an SMTP adapter). Passing null restores capture. */
function setTransport(t) {
    _transport = (t && typeof t.send === 'function') ? t : captureTransport();
}

/** Name of the active transport (for diagnostics / the test endpoint). */
function currentTransport() {
    return _transport && _transport.name ? _transport.name : 'unknown';
}

function validate(message) {
    if (!message || typeof message !== 'object') return 'message is required';
    if (!message.to || !EMAIL_RE.test(String(message.to))) return 'a valid "to" address is required';
    if (!message.subject) return 'subject is required';
    return null;
}

/**
 * Send (or capture) an email. Rejects with an Error whose `code` is
 * 'EMAIL_INVALID' on a bad message, so callers can map it to a 400.
 * @param message { to, subject, text?, html?, from? }
 */
async function sendMail(message) {
    const err = validate(message);
    if (err) {
        const e = new Error(err);
        e.code = 'EMAIL_INVALID';
        throw e;
    }
    const from = message.from || process.env.SMTP_FROM || 'no-reply@timetracker.local';
    return _transport.send({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text || '',
        html: message.html,
    });
}

// Test seam — recent captured messages (newest last).
function _captured() {
    return captured.slice();
}

module.exports = { sendMail, setTransport, currentTransport, _captured };
