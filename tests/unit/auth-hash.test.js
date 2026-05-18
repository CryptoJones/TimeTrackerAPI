// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for auth.hashKey + the short-circuit paths of
// isMaster / getCompanyId.
//
// We can't drive the "hashed value reaches the SQL query" assertion
// from here because vi.mock on db.config.js doesn't intercept the
// nested CJS require chain inside auth.js (documented in audit
// issue #73 P5-M). Behavioral coverage of the hash-on-lookup path
// lives in the integration suite; what this file verifies is the
// pure-Node hash logic + the no-DB short-circuit paths.

import { describe, test, expect } from 'vitest';

const { hashKey, isMaster, getCompanyId } = require('../../app/middleware/auth.js');

describe('auth.hashKey', () => {
    test('returns a 64-char lowercase hex SHA-256 digest', () => {
        const h = hashKey('any-token');
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    test('deterministic: same input → same hash', () => {
        expect(hashKey('abc')).toBe(hashKey('abc'));
    });

    test('different inputs → different hashes', () => {
        expect(hashKey('abc')).not.toBe(hashKey('abd'));
    });

    test('known vector: sha256("") matches RFC reference', () => {
        // Empty-string SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        expect(hashKey('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    test('handles non-string input via String() coercion', () => {
        expect(() => hashKey(12345)).not.toThrow();
        expect(hashKey(12345)).toBe(hashKey('12345'));
    });
});

describe('auth.isMaster — short-circuit paths', () => {
    test('returns false on empty / null input without hitting the DB', async () => {
        expect(await isMaster('')).toBe(false);
        expect(await isMaster(null)).toBe(false);
        expect(await isMaster(undefined)).toBe(false);
    });
});

describe('auth.getCompanyId — short-circuit paths', () => {
    test('returns -1 sentinel on empty / null input without hitting the DB', async () => {
        expect(await getCompanyId('')).toBe(-1);
        expect(await getCompanyId(null)).toBe(-1);
        expect(await getCompanyId(undefined)).toBe(-1);
    });
});
