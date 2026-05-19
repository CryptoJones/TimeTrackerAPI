// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { redactUrl, SENSITIVE_PARAM_NAMES } from '../../app/middleware/redact-url.js';

describe('redactUrl', () => {
    test('returns the URL unchanged if there is no query string', () => {
        expect(redactUrl('/v1/customer/1')).toBe('/v1/customer/1');
    });

    test('returns the URL unchanged if no sensitive param is present', () => {
        expect(redactUrl('/v1/customer?limit=10&offset=0')).toBe('/v1/customer?limit=10&offset=0');
    });

    test('redacts authKey value but keeps the param name', () => {
        const out = redactUrl('/v1/customer/1?authKey=abc-secret-token');
        expect(out).toBe('/v1/customer/1?authKey=<REDACTED>');
    });

    test('redacts case-insensitively', () => {
        expect(redactUrl('/x?AUTHKEY=abc')).toBe('/x?AUTHKEY=<REDACTED>');
        expect(redactUrl('/x?authkey=abc')).toBe('/x?authkey=<REDACTED>');
        expect(redactUrl('/x?AuthKey=abc')).toBe('/x?AuthKey=<REDACTED>');
    });

    test('redacts every sensitive alias', () => {
        for (const name of SENSITIVE_PARAM_NAMES) {
            const out = redactUrl(`/x?${name}=secretvalue`);
            expect(out).not.toContain('secretvalue');
            expect(out).toContain('<REDACTED>');
        }
    });

    test('preserves non-sensitive params next to a sensitive one', () => {
        const out = redactUrl('/v1/x?limit=10&authKey=abc&offset=0');
        expect(out).toBe('/v1/x?limit=10&authKey=<REDACTED>&offset=0');
    });

    test('handles multiple sensitive params', () => {
        const out = redactUrl('/x?token=t1&apiKey=t2&q=safe');
        expect(out).toBe('/x?token=<REDACTED>&apiKey=<REDACTED>&q=safe');
    });

    test('handles param with empty value', () => {
        expect(redactUrl('/x?authKey=')).toBe('/x?authKey=<REDACTED>');
    });

    test('handles bare param without =', () => {
        // `?authKey` alone (no value) — still a leak vector? No, but
        // we should normalize for predictability.
        const out = redactUrl('/x?authKey');
        // Either format is acceptable as long as the param name is
        // detected. Our implementation appends =<REDACTED>.
        expect(out).toBe('/x?authKey=<REDACTED>');
    });

    test('handles URL-encoded param names', () => {
        // `authKey` could arrive percent-encoded; decode for matching.
        // (We don't construct this URL ourselves but a client might.)
        const out = redactUrl('/x?auth%4Bey=abc');  // 'authKey' with %4B (K) — case-y but valid
        // Implementation decodeURIComponents the name; result depends.
        // Just verify the raw secret doesn't appear in the output.
        expect(out).not.toContain('abc');
    });

    test('non-string input returns input unchanged (defensive)', () => {
        expect(redactUrl(undefined)).toBe(undefined);
        expect(redactUrl(null)).toBe(null);
        expect(redactUrl(42)).toBe(42);
    });

    test('does not throw on malformed percent-encoding in param name', () => {
        // decodeURIComponent throws URIError on `%FF` (incomplete UTF-8
        // sequence) or `%ZZ` (invalid hex). pino-http would invoke this
        // serializer once per request, so an unhandled URIError here would
        // either skip the log line or fall back to logging the raw URL —
        // leaking the very value we're meant to redact. Wrap + recover.
        expect(() => redactUrl('/x?%FF=bar')).not.toThrow();
        expect(() => redactUrl('/x?%ZZ=bar&authkey=secret')).not.toThrow();
        // And the sensitive param that follows the malformed one must
        // still be redacted — recovery doesn't abort the loop.
        const out = redactUrl('/x?%ZZ=bar&authkey=secret');
        expect(out).not.toContain('secret');
        expect(out).toContain('authkey=<REDACTED>');
    });
});
