// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the RFC 5988 Link header builder.

import { describe, test, expect, afterEach } from 'vitest';
import { buildLinkHeader } from '../../app/middleware/pagination.js';

function fakeReq({ originalUrl = '/v1/customer/bycompany/1', host = 'api.example.com', protocol = 'https' } = {}) {
    return {
        originalUrl,
        protocol,
        get: (h) => (h.toLowerCase() === 'host' ? host : undefined),
    };
}

describe('buildLinkHeader', () => {
    test('returns null when no pagination is needed (offset=0, count <= limit)', () => {
        const link = buildLinkHeader({ req: fakeReq(), limit: 100, offset: 0, count: 50 });
        expect(link).toBeNull();
    });

    test('emits next + first + last when on the first page of multi-page results', () => {
        const link = buildLinkHeader({ req: fakeReq(), limit: 100, offset: 0, count: 250 });
        expect(link).toContain('rel="next"');
        expect(link).toContain('offset=100');
        expect(link).toContain('rel="first"');
        expect(link).toContain('rel="last"');
        expect(link).toContain('offset=200'); // last page = floor((250-1)/100)*100 = 200
        expect(link).not.toContain('rel="prev"'); // we're on page 0
    });

    test('emits prev + next + first + last on a middle page', () => {
        const link = buildLinkHeader({ req: fakeReq(), limit: 100, offset: 100, count: 300 });
        expect(link).toContain('rel="prev"');
        expect(link).toContain('rel="next"');
        expect(link).toContain('rel="first"');
        expect(link).toContain('rel="last"');
    });

    test('drops next on the last page', () => {
        const link = buildLinkHeader({ req: fakeReq(), limit: 100, offset: 200, count: 250 });
        expect(link).not.toContain('rel="next"');
        expect(link).toContain('rel="prev"');
        expect(link).toContain('rel="first"');
        expect(link).toContain('rel="last"');
    });

    test('preserves other query params (e.g. filter args)', () => {
        const req = fakeReq({ originalUrl: '/v1/timeentry/bycompany/1?customerId=42&from=2026-01-01T00:00:00Z' });
        const link = buildLinkHeader({ req, limit: 100, offset: 0, count: 300 });
        expect(link).toContain('customerId=42');
        expect(link).toContain('from=2026-01-01');
    });

    test('builds absolute URLs (proto + host)', () => {
        const link = buildLinkHeader({
            req: fakeReq({ host: 'node.timetrackerapi.com', protocol: 'https' }),
            limit: 10, offset: 0, count: 50,
        });
        expect(link).toContain('https://node.timetrackerapi.com/v1/customer/bycompany/1');
    });

    test('returns null on invalid inputs', () => {
        expect(buildLinkHeader({ req: fakeReq(), limit: 0, offset: 0, count: 10 })).toBeNull();
        expect(buildLinkHeader({ req: fakeReq(), limit: 10, offset: -1, count: 10 })).toBeNull();
        expect(buildLinkHeader({ req: fakeReq(), limit: 10, offset: 0, count: -1 })).toBeNull();
        expect(buildLinkHeader({ req: fakeReq(), limit: 'abc', offset: 0, count: 10 })).toBeNull();
    });

    test('last page offset is correctly aligned to limit boundary', () => {
        // count=100, limit=30: pages are at offsets 0, 30, 60, 90. Last page = 90.
        const link = buildLinkHeader({ req: fakeReq(), limit: 30, offset: 0, count: 100 });
        expect(link).toContain('offset=90'); // last page anchor
    });

    test('fractional limit/offset are floored to integers in the generated links', () => {
        const link = buildLinkHeader({ req: fakeReq(), limit: 10.5, offset: 10.5, count: 100 });
        // No fractional query params leak into the Link header.
        expect(link).not.toMatch(/(limit|offset)=\d+\.\d+/);
        // limit floors to 10; prev floors to 0; next to 20.
        expect(link).toContain('limit=10');
        expect(link).toContain('offset=0');  // prev/first
        expect(link).toContain('offset=20'); // next (10 + 10)
    });

    describe('PUBLIC_BASE_URL pins the Link header base', () => {
        // Save + restore env so we don't leak into sibling tests.
        const ORIG = process.env.PUBLIC_BASE_URL;
        afterEach(() => {
            if (ORIG === undefined) delete process.env.PUBLIC_BASE_URL;
            else process.env.PUBLIC_BASE_URL = ORIG;
        });

        test('when set, builds Links against PUBLIC_BASE_URL (ignoring Host header)', () => {
            process.env.PUBLIC_BASE_URL = 'https://node.timetrackerapi.com';
            // Malicious Host header should be ignored entirely.
            const link = buildLinkHeader({
                req: fakeReq({ host: 'evil.example', protocol: 'http' }),
                limit: 10, offset: 0, count: 50,
            });
            expect(link).toContain('https://node.timetrackerapi.com/v1/customer/bycompany/1');
            expect(link).not.toContain('evil.example');
        });

        test('trailing slash on PUBLIC_BASE_URL is stripped to prevent `//path`', () => {
            process.env.PUBLIC_BASE_URL = 'https://api.example.com//';
            const link = buildLinkHeader({
                req: fakeReq(),
                limit: 10, offset: 0, count: 50,
            });
            expect(link).toContain('https://api.example.com/v1/customer/bycompany/1');
            expect(link).not.toContain('//v1/customer');
        });

        test('empty / whitespace PUBLIC_BASE_URL falls back to req-based default', () => {
            process.env.PUBLIC_BASE_URL = '   ';
            const link = buildLinkHeader({
                req: fakeReq({ host: 'api.example.com', protocol: 'https' }),
                limit: 10, offset: 0, count: 50,
            });
            expect(link).toContain('https://api.example.com/v1/customer/bycompany/1');
        });
    });
});
