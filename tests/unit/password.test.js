// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../app/services/password.js';

describe('password (#444)', () => {
    test('hash has the scrypt$salt$hash shape and is not the plaintext', () => {
        const h = hashPassword('correct horse battery staple');
        expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
        expect(h).not.toContain('correct horse');
    });

    test('verifyPassword accepts the right password, rejects the wrong one', () => {
        const h = hashPassword('s3cr3t-passw0rd');
        expect(verifyPassword('s3cr3t-passw0rd', h)).toBe(true);
        expect(verifyPassword('wrong', h)).toBe(false);
    });

    test('the same password hashes differently each time (random salt)', () => {
        expect(hashPassword('samepass')).not.toBe(hashPassword('samepass'));
    });

    test('verifyPassword is false for a malformed or empty stored value', () => {
        expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false);
        expect(verifyPassword('x', '')).toBe(false);
        expect(verifyPassword('x', null)).toBe(false);
    });
});
