// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the invoice PDF renderer (app/services/invoice-pdf.js).
// Exercises pdfkit for real — asserts we get a well-formed PDF Buffer and
// that null/empty data degrades gracefully instead of throwing.

import { describe, test, expect } from 'vitest';

const { renderInvoicePdf } = require('../../app/services/invoice-pdf.js');

const isPdf = (buf) => Buffer.isBuffer(buf) && buf.slice(0, 5).toString('latin1') === '%PDF-';

describe('invoice-pdf.renderInvoicePdf', () => {
    test('renders a full invoice to a PDF Buffer', async () => {
        const buf = await renderInvoicePdf({
            company: { name: 'Acme LLC', city: 'Omaha', state: 'NE', zip: '68101' },
            customer: { name: 'Wile E. Coyote' },
            invoice: { number: 'INV-0001', date: '2026-07-01', dueDate: '2026-07-31' },
            lines: [
                { description: 'Consulting — July', amount: 150 },
                { description: 'Design review', amount: 42.5 },
            ],
            totals: { subtotal: 192.5, tax: 0, total: 192.5 },
            payment: { status: 'partial', amountPaid: 100, balance: 92.5 },
        });
        expect(isPdf(buf)).toBe(true);
        expect(buf.length).toBeGreaterThan(500);
    });

    test('degrades gracefully with empty / null data (no throw)', async () => {
        expect(isPdf(await renderInvoicePdf({}))).toBe(true);
        expect(isPdf(await renderInvoicePdf({ lines: [], totals: {}, payment: {} }))).toBe(true);
    });
});
