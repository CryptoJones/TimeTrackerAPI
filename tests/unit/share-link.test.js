// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { resolveTtl, publicInvoiceView, SHARE_TTL_DEFAULT_SEC, SHARE_TTL_MAX_SEC, SHARE_TTL_MIN_SEC } from '../../app/services/share-link.js';

describe('share-link (#438)', () => {
    test('resolveTtl clamps and defaults', () => {
        expect(resolveTtl(undefined)).toBe(SHARE_TTL_DEFAULT_SEC);
        expect(resolveTtl(0)).toBe(SHARE_TTL_DEFAULT_SEC);
        expect(resolveTtl(-5)).toBe(SHARE_TTL_DEFAULT_SEC);
        expect(resolveTtl('nope')).toBe(SHARE_TTL_DEFAULT_SEC);
        expect(resolveTtl(10)).toBe(SHARE_TTL_MIN_SEC); // below min → min
        expect(resolveTtl(3600)).toBe(3600);
        expect(resolveTtl(999 * SHARE_TTL_MAX_SEC)).toBe(SHARE_TTL_MAX_SEC); // above max → max
    });

    test('publicInvoiceView computes balance and a client-safe projection', () => {
        const invoice = {
            invId: 7, invNumber: 'INV-007', invDate: '2026-03-01', invDueDate: '2026-03-31',
            invCurrency: 'USD', invSubtotal: 1000, invTax: 80, invDiscount: 0, invWriteOff: 0,
            invTotal: 1080, invPaid: false,
            invCustId: 3, invArch: false, invNotes: 'internal note',
            customer: { custCompanyName: 'Globex', custFName: 'A', custLName: 'B' },
        };
        const payments = [{ cpayAmount: 300 }, { cpayAmount: 200 }];
        const view = publicInvoiceView(invoice, payments);

        expect(view.invTotal).toBe(1080);
        expect(view.collected).toBe(500);
        expect(view.balance).toBe(580);
        expect(view.customer).toEqual({ name: 'Globex' });
        // Internal-only fields are NOT projected.
        expect('invNotes' in view).toBe(false);
        expect('invCustId' in view).toBe(false);
        expect('invArch' in view).toBe(false);
    });

    test('publicInvoiceView tolerates no payments / no customer', () => {
        const view = publicInvoiceView({ invTotal: 100 }, null);
        expect(view.collected).toBe(0);
        expect(view.balance).toBe(100);
        expect(view.customer).toBeNull();
    });
});
