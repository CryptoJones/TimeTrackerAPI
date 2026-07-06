// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { isInviteValid, INVITE_TTL_SEC } from '../../app/services/invitation.js';

const NOW = new Date('2026-05-01T00:00:00Z').getTime();
const future = '2026-05-05T00:00:00Z';
const past = '2026-04-01T00:00:00Z';

describe('invitation (#458)', () => {
    test('INVITE_TTL_SEC is 7 days', () => {
        expect(INVITE_TTL_SEC).toBe(7 * 24 * 60 * 60);
    });

    test('valid for a matching, unexpired, unaccepted invite', () => {
        const inv = { invtArch: false, invtAcceptedAt: null, invtTokenHash: 'abc', invtExpires: future };
        expect(isInviteValid(inv, 'abc', NOW)).toBe(true);
    });

    test('invalid when hash mismatches', () => {
        const inv = { invtArch: false, invtAcceptedAt: null, invtTokenHash: 'abc', invtExpires: future };
        expect(isInviteValid(inv, 'WRONG', NOW)).toBe(false);
    });

    test('invalid when expired', () => {
        const inv = { invtArch: false, invtAcceptedAt: null, invtTokenHash: 'abc', invtExpires: past };
        expect(isInviteValid(inv, 'abc', NOW)).toBe(false);
    });

    test('invalid when already accepted or archived or missing', () => {
        expect(isInviteValid({ invtArch: false, invtAcceptedAt: '2026-04-15T00:00:00Z', invtTokenHash: 'abc', invtExpires: future }, 'abc', NOW)).toBe(false);
        expect(isInviteValid({ invtArch: true, invtAcceptedAt: null, invtTokenHash: 'abc', invtExpires: future }, 'abc', NOW)).toBe(false);
        expect(isInviteValid(null, 'abc', NOW)).toBe(false);
    });
});
