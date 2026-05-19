// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * URL-redaction helper used by the pino-http request serializer.
 *
 * The authKey header is already covered by logger.js's redact paths
 * (`req.headers.authkey`, etc.), but `req.url` is logged verbatim
 * via the serializer and may still contain the raw token if an SDK
 * mistakenly puts it in the query string (e.g.
 * `GET /v1/customer/5?authKey=...`). This function strips a small
 * allowlist of known-sensitive query params before the URL hits the
 * structured log.
 *
 * Pattern matching is case-insensitive on the param name and
 * preserves the rest of the URL (path, ordering, other params).
 */

const SENSITIVE_PARAM_NAMES = new Set([
    'authkey',
    'apikey',
    'api_key',
    'token',
    'access_token',
    'password',
    'secret',
]);

function redactUrl(url) {
    if (typeof url !== 'string' || url.length === 0) return url;
    const qIdx = url.indexOf('?');
    if (qIdx === -1) return url;

    const path = url.slice(0, qIdx);
    const qs = url.slice(qIdx + 1);

    // Hand-roll the parse to avoid pulling in URL/URLSearchParams.
    // URLSearchParams would also work but reorders / normalizes
    // params which complicates log diffing.
    const parts = qs.split('&');
    const out = [];
    for (const part of parts) {
        if (part.length === 0) continue;
        const eq = part.indexOf('=');
        const rawName = eq === -1 ? part : part.slice(0, eq);
        // decodeURIComponent throws URIError on malformed percent-encoding
        // (e.g. `?%FF=v` or `?%ZZ=v`). pino-http calls this serializer for
        // every request, so an unhandled throw here would either skip the
        // log line entirely or fall back to logging the raw URL — leaking
        // the very value we're trying to redact. Wrap and treat
        // undecodable names as non-sensitive (the raw bytes are kept in
        // the output, so no value is lost; a malformed name almost
        // certainly isn't a real `authkey=…` anyway).
        let name;
        try {
            name = decodeURIComponent(rawName).toLowerCase();
        } catch (_err) {
            name = rawName.toLowerCase();
        }
        if (SENSITIVE_PARAM_NAMES.has(name)) {
            out.push(`${rawName}=<REDACTED>`);
        } else {
            out.push(part);
        }
    }
    return out.length > 0 ? `${path}?${out.join('&')}` : path;
}

module.exports = { redactUrl, SENSITIVE_PARAM_NAMES };
