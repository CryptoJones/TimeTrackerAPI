// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { generateToken, isValid } from '../../app/services/password-reset.js';

describe('password-reset (#446)', () => {
    test('generateToken is 64-char hex and unpredictable', () => {
        expect(generateToken()).toMatch(/^[0-9a-f]{64}$/);
        expect(generateToken()).not.toBe(generateToken());
    });

    test('isValid true for a matching, unexpired token', () => {
        const user = { userResetTokenHash: 'abc', userResetExpires: '2026-01-01T01:00:00Z' };
        const now = new Date('2026-01-01T00:30:00Z').getTime();
        expect(isValid(user, 'abc', now)).toBe(true);
    });

    test('isValid false when the hash does not match', () => {
        const user = { userResetTokenHash: 'abc', userResetExpires: '2026-01-01T01:00:00Z' };
        const now = new Date('2026-01-01T00:30:00Z').getTime();
        expect(isValid(user, 'WRONG', now)).toBe(false);
    });

    test('isValid false when expired', () => {
        const user = { userResetTokenHash: 'abc', userResetExpires: '2026-01-01T01:00:00Z' };
        const now = new Date('2026-01-01T02:00:00Z').getTime();
        expect(isValid(user, 'abc', now)).toBe(false);
    });

    test('isValid false with no pending reset', () => {
        expect(isValid({ userResetTokenHash: null, userResetExpires: null }, 'abc', Date.now())).toBe(false);
        expect(isValid(null, 'abc', Date.now())).toBe(false);
    });
});
