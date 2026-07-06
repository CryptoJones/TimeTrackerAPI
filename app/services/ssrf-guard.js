// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * ssrf-guard.js — SSRF protection for outbound requests to a
 * tenant-controlled URL (currently webhook delivery, #69).
 *
 * A tenant can register any `whkUrl`; without this guard the server would
 * happily POST to `http://169.254.169.254/…` (cloud metadata),
 * `http://127.0.0.1:6379/` (internal Redis), or a private-range host, and
 * a redirect from a public host could hop to an internal one. This module:
 *
 *   1. pins the scheme to http/https,
 *   2. resolves the destination host and rejects the request if ANY
 *      resolved IP is loopback / link-local / private / reserved /
 *      IPv4-mapped-to-one-of-those, and
 *   3. follows redirects MANUALLY, re-validating every hop (so a
 *      public → internal 302 can't bypass the check).
 *
 * Pure Node stdlib (node:dns + node:net) — no dependency, works on every
 * supported Node. NOTE (documented residual): a resolve-then-connect
 * design has a narrow DNS-rebinding TOCTOU window; closing it fully needs
 * connect-time IP pinning (a custom dispatcher). The proven attacks
 * (direct internal URL, redirect-to-internal) are fully closed here.
 */

const dns = require('node:dns').promises;
const net = require('node:net');

class SsrfBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}

// IPv4 ranges that must never be reachable from a tenant URL. Covers
// loopback, RFC1918 private, link-local (incl. 169.254.169.254 metadata),
// CGNAT, "this network", TEST-NET, benchmarking, multicast, reserved, and
// the broadcast address.
const V4_BLOCKS = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
];

function v4ToInt(ip) {
    const p = ip.split('.');
    return (((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + (+p[3])) >>> 0;
}

function v4InBlock(ipInt, base, bits) {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (v4ToInt(base) & mask);
}

function isBlockedV4(ip) {
    const ipInt = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => v4InBlock(ipInt, base, bits));
}

/**
 * Extract the embedded IPv4 (dotted) from an IPv4-mapped / -embedded IPv6,
 * or null. Handles the compressed hex form the URL parser canonicalizes to
 * (`::ffff:a9fe:a9fe` for `::ffff:169.254.169.254`), the dotted mapped form,
 * and a trailing dotted v4 (e.g. NAT64 `64:ff9b::a.b.c.d`).
 */
function embeddedV4(lower) {
    let m = lower.match(/^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
        const hi = parseInt(m[1], 16);
        const lo = parseInt(m[2], 16);
        return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    }
    m = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (m && net.isIP(m[1]) === 4) return m[1];
    return null;
}

/**
 * True if `ip` is a non-public (loopback/link-local/private/reserved)
 * address that a tenant-controlled URL must not reach. Fails CLOSED: a
 * value that isn't a recognizable public IP is treated as blocked.
 */
function isBlockedIp(ip) {
    const fam = net.isIP(ip);
    if (fam === 4) return isBlockedV4(ip);
    if (fam === 6) {
        const lower = ip.toLowerCase();
        const v4 = embeddedV4(lower);
        if (v4) return isBlockedV4(v4);
        // A mapped address we couldn't parse to a v4 → fail closed.
        if (lower.startsWith('::ffff:')) return true;
        if (lower === '::1' || lower === '::') return true;      // loopback / unspecified
        if (/^f[cd]/.test(lower)) return true;                    // fc00::/7 unique-local
        if (/^fe[89ab]/.test(lower)) return true;                 // fe80::/10 link-local
        if (/^ff/.test(lower)) return true;                       // ff00::/8 multicast
        return false;
    }
    return true; // not a valid IP literal → fail closed
}

/**
 * Validate a destination URL: scheme must be http/https, and every IP the
 * host resolves to must be public. Throws SsrfBlockedError otherwise.
 * Returns the resolved IPs on success.
 */
async function assertPublicUrl(rawUrl) {
    let u;
    try {
        u = new URL(rawUrl);
    } catch (_) {
        throw new SsrfBlockedError('invalid url');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new SsrfBlockedError(`scheme not allowed: ${u.protocol}`);
    }
    const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    let ips;
    if (net.isIP(host)) {
        ips = [host];
    } else {
        let records;
        try {
            records = await dns.lookup(host, { all: true });
        } catch (_) {
            throw new SsrfBlockedError('dns lookup failed');
        }
        ips = records.map((r) => r.address);
    }
    if (ips.length === 0) throw new SsrfBlockedError('no address');
    for (const ip of ips) {
        if (isBlockedIp(ip)) throw new SsrfBlockedError(`blocked destination ${ip}`);
    }
    return ips;
}

/**
 * fetch() wrapper that enforces the SSRF guard on the initial URL AND on
 * every redirect hop (redirect handled manually so a public → internal
 * redirect can't bypass validation). Same signature/return as fetch;
 * throws SsrfBlockedError if any hop targets a non-public host.
 */
async function safeFetch(rawUrl, options = {}, maxRedirects = 3) {
    let current = rawUrl;
    for (let hop = 0; ; hop += 1) {
        await assertPublicUrl(current);
        const res = await fetch(current, { ...options, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get('location');
            if (!loc) return res;
            if (hop >= maxRedirects) throw new SsrfBlockedError('too many redirects');
            current = new URL(loc, current).href; // re-validated at loop top
            continue;
        }
        return res;
    }
}

module.exports = { isBlockedIp, assertPublicUrl, safeFetch, SsrfBlockedError };
