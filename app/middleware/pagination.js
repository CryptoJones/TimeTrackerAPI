// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Build an RFC 5988 Link header value for a paginated response.
 *
 *   Link: <https://api.example.com/v1/customer/bycompany/1?limit=100&offset=100>; rel="next",
 *         <https://api.example.com/v1/customer/bycompany/1?limit=100&offset=0>; rel="prev",
 *         <https://api.example.com/v1/customer/bycompany/1?limit=100&offset=0>; rel="first",
 *         <https://api.example.com/v1/customer/bycompany/1?limit=100&offset=200>; rel="last"
 *
 * Returns null when there's no pagination (count <= limit + offset == 0).
 * Callers set the header conditionally:
 *
 *   const link = buildLinkHeader({ req, limit, offset, count });
 *   if (link) res.setHeader('Link', link);
 *
 * Inputs:
 *   - req:    the express request (read req.originalUrl + req.protocol + req.get('host'))
 *   - limit:  the page size (the same value the controller returned in body.limit)
 *   - offset: the current page's offset
 *   - count:  total row count across all pages
 */

function buildLinkHeader({ req, limit, offset, count }) {
    const lim = Number(limit);
    const off = Number(offset);
    const total = Number(count);
    if (!Number.isFinite(lim) || lim <= 0) return null;
    if (!Number.isFinite(off) || off < 0) return null;
    if (!Number.isFinite(total) || total < 0) return null;

    // Resolve the URL minus the query string. req.originalUrl is "/path?qs";
    // strip the qs portion deterministically.
    const url = req.originalUrl || '/';
    const qIdx = url.indexOf('?');
    const basePath = qIdx === -1 ? url : url.slice(0, qIdx);
    const existingQs = qIdx === -1 ? '' : url.slice(qIdx + 1);

    // Base URL resolution, in priority order:
    //   1. PUBLIC_BASE_URL env var — operator-pinned canonical hostname.
    //      Use this in production behind a reverse proxy that may
    //      receive arbitrary Host headers; pinning here prevents a
    //      client that sends `Host: evil.com` from getting evil.com
    //      echoed back into the Link header (next/prev/first/last)
    //      and influencing how its own paginating client walks the
    //      result set.
    //   2. req.protocol + req.get('host') — the express defaults.
    //      Useful for local development and for deployments where the
    //      Host header is already filtered upstream (Caddy with a
    //      pinned TLS_DOMAIN, nginx with a server_name match, etc.).
    let baseUrl;
    const envBase = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    if (envBase) {
        baseUrl = envBase;
    } else {
        const proto = (req.protocol || 'http');
        const host = (req.get && req.get('host')) || 'localhost';
        baseUrl = `${proto}://${host}`;
    }

    const buildLink = (newOffset) => {
        const params = new URLSearchParams(existingQs);
        params.set('limit', String(lim));
        params.set('offset', String(newOffset));
        return `${baseUrl}${basePath}?${params.toString()}`;
    };

    const links = [];

    // next: only if there's a next page
    if (off + lim < total) {
        links.push(`<${buildLink(off + lim)}>; rel="next"`);
    }
    // prev: only if not on the first page
    if (off > 0) {
        const prevOffset = Math.max(0, off - lim);
        links.push(`<${buildLink(prevOffset)}>; rel="prev"`);
    }
    // first: always include if pagination applies (offset > 0 OR there's a next)
    if (off > 0 || off + lim < total) {
        links.push(`<${buildLink(0)}>; rel="first"`);
    }
    // last: only if there's data and pagination matters
    if (total > 0 && (off > 0 || off + lim < total)) {
        const lastOffset = Math.floor(Math.max(0, total - 1) / lim) * lim;
        links.push(`<${buildLink(lastOffset)}>; rel="last"`);
    }

    return links.length === 0 ? null : links.join(', ');
}

module.exports = { buildLinkHeader };
