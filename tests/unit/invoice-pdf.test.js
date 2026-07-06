// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the invoice PDF renderer (app/services/invoice-pdf.js).
// Exercises pdfkit for real — asserts we get a well-formed PDF Buffer and
// that null/empty data degrades gracefully instead of throwing.

import { describe, test, expect } from 'vitest';

const { renderInvoicePdf, clip, MAX_DESC_CHARS, MAX_PDF_LINES } = require('../../app/services/invoice-pdf.js');

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

    test('renders per-invoice notes and a company footer (#423)', async () => {
        const buf = await renderInvoicePdf({
            company: { name: 'Acme LLC', footer: 'Payment due within 30 days. Wire to acct #1234.' },
            customer: { name: 'Wile E. Coyote' },
            invoice: { number: 'INV-0002', date: '2026-07-01', dueDate: '2026-07-31', notes: 'Retainer applied against this invoice.' },
            lines: [{ description: 'Consulting', amount: 100 }],
            totals: { subtotal: 100, tax: 0, total: 100 },
            payment: { status: 'sent', balance: 100 },
        });
        expect(isPdf(buf)).toBe(true);
        expect(buf.length).toBeGreaterThan(500);
    });

    test('summary format collapses line items; detailed itemizes (#424)', async () => {
        const base = {
            invoice: { number: 'INV-0003', date: '2026-07-01' },
            lines: [{ description: 'Consulting', amount: 100 }, { description: 'Design', amount: 50 }],
            totals: { subtotal: 150, tax: 0, total: 150 },
            payment: {},
        };
        const detailed = await renderInvoicePdf(base);
        const summary = await renderInvoicePdf({ ...base, format: 'summary' });
        expect(isPdf(detailed)).toBe(true);
        expect(isPdf(summary)).toBe(true);
    });

    test('renders amounts in the invoice currency (#427)', async () => {
        const eur = await renderInvoicePdf({
            invoice: { number: 'INV-0004' }, currency: 'EUR',
            lines: [{ description: 'Consulting', amount: 100 }],
            totals: { subtotal: 100, tax: 0, total: 100 }, payment: {},
        });
        const other = await renderInvoicePdf({
            invoice: { number: 'INV-0005' }, currency: 'SEK', // no symbol → code prefix
            lines: [{ description: 'Consulting', amount: 100 }],
            totals: { subtotal: 100, tax: 0, total: 100 }, payment: {},
        });
        expect(isPdf(eur)).toBe(true);
        expect(isPdf(other)).toBe(true);
    });

    test('clip bounds text length (guards the pdfkit event-loop stall)', () => {
        expect(clip('short', 300)).toBe('short');
        expect(clip(null, 300)).toBe('');
        expect(clip(undefined, 300)).toBe('');
        const out = clip('x'.repeat(10000), MAX_DESC_CHARS);
        expect(out.length).toBe(MAX_DESC_CHARS);
        expect(out.endsWith('…')).toBe(true);
    });

    test('a hostile invoice (many long unbroken descriptions) renders bounded, not frozen', async () => {
        // Pre-fix this froze the single-threaded event loop for ~6s (100
        // lines × 10k-char unbroken jobDesc → pdfkit superlinear word-fit),
        // stalling the whole server. The clip + line cap keep it fast.
        // Generous ceiling to avoid CI flake (fixed ≈130ms; unbounded ≈5850ms).
        const bigDesc = 'x'.repeat(10000);
        const lines = Array.from({ length: MAX_PDF_LINES + 200 }, () => ({ description: bigDesc, amount: 100 }));
        const t = Date.now();
        const buf = await renderInvoicePdf({
            invoice: { number: 'INV-DOS', notes: 'y'.repeat(50000) },
            lines, totals: { subtotal: 0, tax: 0, total: 0 }, payment: {},
        });
        expect(isPdf(buf)).toBe(true);
        expect(Date.now() - t).toBeLessThan(2000);
    });
});
