// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Key generator for express-rate-limit.
 *
 * Authenticated requests are keyed by a sha256 hash prefix of the
 * `authKey` header — so two clients sharing an IP (mobile carrier
 * NAT, corporate proxy, etc.) get independent rate budgets, and a
 * brute-force attacker rotating source IPs can't stretch a
 * per-IP budget by switching networks. Anonymous requests fall
 * back to IP (the brute-force path, where per-IP is the right
 * granularity).
 *
 * The hash prefix (16 hex chars = 64 bits) is plenty unique for
 * keyspace separation and keeps the raw token out of any
 * downstream rate-limiter store.
 *
 * IPv6 handling: express-rate-limit v8+ refuses to start unless any
 * custom keyGenerator that touches `req.ip` routes the value through
 * `ipKeyGenerator(ip)`. The helper canonicalizes IPv4 addresses
 * (returning them verbatim) and IPv6 addresses (collapsing them to
 * their /56 network prefix — the helper's default `ipv6Subnet`).
 * Without this wrapper, an IPv6 client could present a fresh address
 * from anywhere inside their allocation on every request and slip
 * past the per-IP budget.
 *
 * Exported separately from server.js so unit tests can exercise
 * the keying directly without spinning up an HTTP server.
 */

const crypto = require('crypto');
const { ipKeyGenerator } = require('express-rate-limit');

function keyByAuthKeyOrIp(req /*, res */) {
    const authKey = req.get && req.get('authKey');
    if (authKey) {
        return 'k:' + crypto.createHash('sha256').update(authKey).digest('hex').slice(0, 16);
    }
    // express-rate-limit v8+ requires the helper. It takes the raw
    // IP string and returns the IPv4 address verbatim or the IPv6
    // /56 network prefix (the helper's default). Fall back to
    // 'unknown' when no source IP is available (e.g. unit-test
    // fixtures or non-IP transports).
    //
    // `req.socket.remoteAddress` is the modern accessor — Node has
    // marked `req.connection` deprecated (legacy alias for socket)
    // since 13.x. Same value, future-proof name.
    const ip = req.ip || (req.socket && req.socket.remoteAddress);
    if (!ip) return 'ip:unknown';
    return 'ip:' + ipKeyGenerator(ip);
}

module.exports = { keyByAuthKeyOrIp };
