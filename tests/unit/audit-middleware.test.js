// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the audit middleware's entity parser (#460).

import { describe, test, expect } from 'vitest';

const { entityOf } = require('../../app/middleware/audit.js');

describe('audit.entityOf', () => {
    test('parses the entity segment from a /v1 path', () => {
        expect(entityOf('/v1/invoice/5')).toBe('invoice');
        expect(entityOf('/v1/timeentry')).toBe('timeentry');
        expect(entityOf('/v1/report/budget')).toBe('report');
        expect(entityOf('/v1/auditlog/bycompany/1')).toBe('auditlog');
    });
    test('returns null for non-/v1 or empty paths', () => {
        expect(entityOf('/healthz')).toBeNull();
        expect(entityOf('')).toBeNull();
        expect(entityOf(null)).toBeNull();
    });
});
