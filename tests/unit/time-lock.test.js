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

    test('resolves a zone offset to the true UTC calendar day (matches Date input)', () => {
        // 2026-07-07T01:00:00+05:00 is the instant 2026-07-06T20:00:00Z.
        expect(dateOf('2026-07-07T01:00:00+05:00')).toBe('2026-07-06');
        expect(dateOf('2026-07-06T20:00:00-05:00')).toBe('2026-07-07');
        // A Date input for the same instant agrees.
        expect(dateOf(new Date('2026-07-07T01:00:00+05:00'))).toBe('2026-07-06');
    });

    test('a bare YYYY-MM-DD is taken as-is; invalid values are null', () => {
        expect(dateOf('2026-07-06')).toBe('2026-07-06');
        expect(dateOf('not-a-date')).toBeNull();
        expect(dateOf('2026-13-45T00:00:00Z')).toBeNull(); // format-valid, calendar-invalid
        expect(dateOf(new Date('nope'))).toBeNull();
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

    test('a zone offset cannot slip an entry past the lock (regression)', () => {
        // The instant 2026-07-06T20:00:00Z belongs to the locked day even
        // though its wall-clock string reads 2026-07-07 — must stay locked.
        expect(lockReason({ approvalStatus: 'open', startedAt: '2026-07-07T01:00:00+05:00', lockDate: '2026-07-06' }))
            .toMatch(/period is locked/);
        // Conversely, an instant that is genuinely after the lock stays
        // editable even if its wall-clock string reads the locked day.
        expect(lockReason({ approvalStatus: 'open', startedAt: '2026-07-06T20:00:00-05:00', lockDate: '2026-07-06' }))
            .toBeNull();
    });
});
