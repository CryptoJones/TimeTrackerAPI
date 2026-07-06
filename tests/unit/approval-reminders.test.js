// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { buildApprovalDigest } from '../../app/services/approval-reminders.js';

describe('buildApprovalDigest (#442)', () => {
    test('summarizes submitted entries with count, total, and lines', () => {
        const d = buildApprovalDigest([
            { teId: 7, teStartedAt: '2026-01-05T09:00:00Z', teMinutes: 120, worker: { workerFName: 'Ada', workerLName: 'Lovelace' } },
            { teId: 8, teStartedAt: '2026-01-06T09:00:00Z', teMinutes: 60, worker: { workerFName: 'Bo', workerLName: null } },
        ], { olderThanDays: 7 });
        expect(d.count).toBe(2);
        expect(d.totalMinutes).toBe(180);
        expect(d.subject).toBe('2 time entries awaiting approval');
        expect(d.text).toContain('#7  Ada Lovelace  2026-01-05  120 min');
        expect(d.text).toContain('more than 7 day(s)');
        expect(d.text).toContain('Total: 2 entries, 180 minutes.');
    });

    test('singular subject for exactly one entry', () => {
        const d = buildApprovalDigest([{ teId: 1, teStartedAt: '2026-01-01', teMinutes: 30, worker: null }]);
        expect(d.subject).toBe('1 time entry awaiting approval');
        expect(d.text).toContain('Unknown worker');
    });

    test('handles an in-progress entry (null minutes) and empty input', () => {
        expect(buildApprovalDigest([{ teId: 2, teStartedAt: '2026-01-01', teMinutes: null, worker: null }]).text).toContain('(in progress)');
        const empty = buildApprovalDigest([]);
        expect(empty.count).toBe(0);
        expect(empty.subject).toBe('0 time entries awaiting approval');
    });
});
