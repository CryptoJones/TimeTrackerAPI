// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit coverage for the invoice PDF renderer. DB-free: it takes
// already-loaded rows, so we can assert it produces a valid PDF buffer
// without a database or HTTP layer.

import { describe, test, expect } from 'vitest';

const pdf = require('../../app/services/invoice-pdf.js');

describe('renderInvoicePdf', () => {
    test('produces a non-trivial PDF buffer', async () => {
        const buf = await pdf.renderInvoicePdf({
            invoice: { invId: 7, invDate: '2026-01-01', invDueDate: '2026-02-01', invCustId: 3 },
            lines: [{ injbJobId: 5, injbAmount: 100 }, { injbJobId: null, injbAmount: 60 }],
            payments: [{ cpayAmount: 40 }],
            customer: { custCompanyName: 'Acme', custFName: 'A', custLName: 'B' },
            company: { compName: 'My Co' },
        });
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.slice(0, 5).toString('latin1')).toBe('%PDF-');
        expect(buf.length).toBeGreaterThan(500);
    });

    test('renders with missing optional data without throwing', async () => {
        const buf = await pdf.renderInvoicePdf({ invoice: { invId: 1 } });
        expect(buf.slice(0, 5).toString('latin1')).toBe('%PDF-');
    });

    test('usd + lineLabel helpers', () => {
        expect(pdf._internals.usd(100)).toBe('$100.00');
        expect(pdf._internals.usd(1.005)).toBe('$1.01');
        expect(pdf._internals.lineLabel({ injbJobId: null })).toMatch(/brought forward/i);
        expect(pdf._internals.lineLabel({ injbJobId: 5 })).toBe('Job #5');
    });
});
