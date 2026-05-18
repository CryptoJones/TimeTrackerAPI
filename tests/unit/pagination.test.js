// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the RFC 5988 Link header builder.

import { describe, test, expect } from 'vitest';
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
});
