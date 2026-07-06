// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the time-lock rules (app/services/time-lock.js).

import { describe, test, expect } from 'vitest';

const { lockReason, dateOf } = require('../../app/services/time-lock.js');

describe('time-lock.dateOf', () => {
    test('extracts the date from a Date or ISO string', () => {
        expect(dateOf('2026-07-05T09:00:00Z')).toBe('2026-07-05');
        expect(dateOf(null)).toBeNull();
    });
});

describe('time-lock.lockReason', () => {
    test('approved entries are locked regardless of dates', () => {
        expect(lockReason({ approvalStatus: 'approved', startedAt: '2026-12-01T09:00:00Z', lockDate: null }))
            .toMatch(/approved/);
    });

    test('an entry on or before the lock date is locked', () => {
        expect(lockReason({ approvalStatus: 'open', startedAt: '2026-06-30T09:00:00Z', lockDate: '2026-06-30' }))
            .toMatch(/period is locked/); // equal date → locked
        expect(lockReason({ approvalStatus: 'open', startedAt: '2026-06-15T09:00:00Z', lockDate: '2026-06-30' }))
            .toMatch(/period is locked/);
    });

    test('an entry after the lock date is NOT locked', () => {
        expect(lockReason({ approvalStatus: 'open', startedAt: '2026-07-01T09:00:00Z', lockDate: '2026-06-30' }))
            .toBeNull();
    });

    test('no lock date + not approved → not locked', () => {
        expect(lockReason({ approvalStatus: 'submitted', startedAt: '2026-01-01T09:00:00Z', lockDate: null }))
            .toBeNull();
        expect(lockReason({})).toBeNull();
    });
});
