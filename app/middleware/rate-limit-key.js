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
 * Exported separately from server.js so unit tests can exercise
 * the keying directly without spinning up an HTTP server.
 */

const crypto = require('crypto');

function keyByAuthKeyOrIp(req /*, res */) {
    const authKey = req.get && req.get('authKey');
    if (authKey) {
        return 'k:' + crypto.createHash('sha256').update(authKey).digest('hex').slice(0, 16);
    }
    return 'ip:' + (req.ip || (req.connection && req.connection.remoteAddress) || 'unknown');
}

module.exports = { keyByAuthKeyOrIp };
