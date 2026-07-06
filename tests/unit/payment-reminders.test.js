// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { buildDunningDigest } from '../../app/services/payment-reminders.js';

const TODAY = '2026-03-01';

describe('buildDunningDigest (#10)', () => {
    test('includes overdue invoices with an outstanding balance', () => {
        const d = buildDunningDigest([
            { invId: 1, invNumber: 'INV-001', custName: 'Globex', dueDate: '2026-02-01', total: 1000, collected: 400 },
            { invId: 2, invNumber: 'INV-002', custName: 'Initech', dueDate: '2026-02-10', total: 500, collected: 0 },
        ], { today: TODAY });
        expect(d.count).toBe(2);
        expect(d.totalOutstanding).toBe(1100); // 600 + 500
        expect(d.subject).toBe('2 overdue invoices');
        // Sorted by outstanding desc: 600 (INV-001) first.
        expect(d.invoices[0].invNumber).toBe('INV-001');
        expect(d.text).toContain('outstanding 600.00');
        expect(d.text).toContain('Total outstanding: 1100.00');
    });

    test('excludes fully-paid invoices (outstanding 0)', () => {
        const d = buildDunningDigest([
            { invId: 1, dueDate: '2026-02-01', total: 1000, collected: 1000 },
        ], { today: TODAY });
        expect(d.count).toBe(0);
    });

    test('excludes not-yet-due invoices', () => {
        const d = buildDunningDigest([
            { invId: 1, dueDate: '2026-04-01', total: 1000, collected: 0 },
        ], { today: TODAY });
        expect(d.count).toBe(0);
    });

    test('olderThanDays shifts the cutoff (grace period)', () => {
        const invs = [{ invId: 1, dueDate: '2026-02-25', total: 100, collected: 0 }]; // 4 days overdue
        expect(buildDunningDigest(invs, { today: TODAY, olderThanDays: 0 }).count).toBe(1);
        expect(buildDunningDigest(invs, { today: TODAY, olderThanDays: 30 }).count).toBe(0); // within 30-day grace
    });

    test('falls back to invoice date when no due date', () => {
        const d = buildDunningDigest([
            { invId: 1, date: '2026-01-01', total: 200, collected: 0 },
        ], { today: TODAY });
        expect(d.count).toBe(1);
        expect(d.subject).toBe('1 overdue invoice');
    });
});
