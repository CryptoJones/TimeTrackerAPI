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
 * `ipKeyGenerator(req, res)`. The helper canonicalizes IPv4 and IPv6
 * addresses (matching them to a /64 prefix on IPv6 to prevent a
 * single client from bypassing limits by rotating through their /64
 * allocation). Without this wrapper, IPv6 clients could each present
 * a unique address and slip past the per-IP budget.
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
    // /64 prefix. Fall back to 'unknown' when no source IP is
    // available (e.g. unit-test fixtures or non-IP transports).
    const ip = req.ip || (req.connection && req.connection.remoteAddress);
    if (!ip) return 'ip:unknown';
    return 'ip:' + ipKeyGenerator(ip);
}

module.exports = { keyByAuthKeyOrIp };
