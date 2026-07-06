// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * jwt.js — minimal HS256 JSON Web Tokens for user sign-in (#445). Uses
 * Node's built-in crypto HMAC — NO external dependency. Signs a compact
 * `header.payload.signature`; `verify` is constant-time and enforces the
 * `exp` claim. PURE (crypto only), unit-testable.
 */

const crypto = require('crypto');

function b64url(input) {
    return Buffer.from(input).toString('base64url');
}

/** Sign a payload → a compact JWS string. expiresInSec defaults to 1h. */
function sign(payload, secret, expiresInSec) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const ttl = Number(expiresInSec);
    const body = Object.assign({}, payload, { iat: now, exp: now + (Number.isFinite(ttl) ? ttl : 3600) });
    const data = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(body));
    const sig = crypto.createHmac('sha256', String(secret)).update(data).digest('base64url');
    return data + '.' + sig;
}

/** Verify + decode a token. Returns the payload, or null if invalid/expired. */
function verify(token, secret) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const data = parts[0] + '.' + parts[1];
    const expected = crypto.createHmac('sha256', String(secret)).update(data).digest('base64url');
    const a = Buffer.from(parts[2]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || a.length === 0) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    let body;
    try {
        body = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (_) {
        return null;
    }
    // Enforce the exp claim. A token must carry a finite numeric exp and
    // must not be past it. Rejecting a token that lacks exp is fail-closed:
    // sign() always sets one, so an exp-less token was NOT minted here (it
    // would otherwise never expire). This matches the module's documented
    // contract that verify "enforces the exp claim".
    if (!body || !Number.isFinite(body.exp)) return null;
    if (Math.floor(Date.now() / 1000) > body.exp) return null;
    return body;
}

module.exports = { sign, verify };
