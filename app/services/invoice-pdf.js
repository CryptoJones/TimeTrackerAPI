// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * invoice-pdf.js — render an invoice to a branded PDF (#391).
 *
 * `pdfkit` is required lazily inside renderInvoicePdf so the dependency
 * only loads on the PDF path (it pulls in font machinery); the rest of
 * the API never pays for it. Amounts are formatted through money.js so
 * the printed figures match the stored NUMERIC exactly.
 *
 * Input is a plain data object (see the `data` shape in
 * invoicecontroller.pdf), so this stays decoupled from Sequelize models
 * and easy to unit test.
 */

const money = require('./money.js');

// Currency-aware money formatting (#427): a symbol for common codes,
// else the 3-letter code as a prefix. Defaults to USD when unset.
const SYMBOLS = { USD: '$', CAD: '$', AUD: '$', NZD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };
function fmtMoney(n, currency) {
    if (n == null) return '—';
    const code = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency)
        ? currency.toUpperCase() : 'USD';
    const sym = SYMBOLS[code];
    return sym ? sym + money.toFixedString(n) : code + ' ' + money.toFixedString(n);
}

// Bound the text handed to pdfkit. A very long — especially unbroken —
// string makes pdfkit's word-fit measurement SUPERLINEAR, freezing the
// single-threaded event loop for seconds per PDF. `jobDesc` is
// caller-controlled (up to 10k chars) and the line count is uncapped, so
// one GET /v1/invoice/:id/pdf could otherwise stall the whole server
// (100 long-description lines measured at ~6s of frozen loop). A printed
// invoice line needs only a short label; excess is truncated with an
// ellipsis and, past MAX_PDF_LINES, summarised.
const MAX_DESC_CHARS = 300;
const MAX_NOTES_CHARS = 4000;
const MAX_PDF_LINES = 1000;

function clip(val, max) {
    const s = val == null ? '' : String(val);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function drawInvoice(doc, data) {
    const company = data.company || {};
    const customer = data.customer || {};
    const invoice = data.invoice || {};
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const totals = data.totals || {};
    const payment = data.payment || {};
    // Format all amounts in the invoice's currency (#427).
    const usd = (n) => fmtMoney(n, data.currency);

    // ---- Header: company (left), INVOICE meta (right) ----
    doc.fontSize(20).font('Helvetica-Bold').text(company.name || 'Company', 50, 50);
    doc.fontSize(9).font('Helvetica');
    const addr = [
        company.address1, company.address2,
        [company.city, company.state, company.zip].filter(Boolean).join(' '),
        company.phone, company.email,
    ].filter(Boolean);
    doc.text(addr.join('\n'), 50, 74);

    doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', 380, 50, { align: 'right', width: 165 });
    doc.fontSize(10).font('Helvetica');
    const meta = [
        invoice.number ? `No. ${invoice.number}` : null,
        invoice.date ? `Date: ${invoice.date}` : null,
        invoice.dueDate ? `Due: ${invoice.dueDate}` : null,
        payment.status ? `Status: ${String(payment.status).toUpperCase()}` : null,
    ].filter(Boolean);
    doc.text(meta.join('\n'), 380, 82, { align: 'right', width: 165 });

    // ---- Bill to ----
    doc.moveTo(50, 150).lineTo(545, 150).stroke();
    doc.fontSize(9).font('Helvetica-Bold').text('BILL TO', 50, 162);
    doc.fontSize(11).font('Helvetica').text(customer.name || 'Customer', 50, 176);

    // ---- Line items table ----
    // Summary format (#424) collapses the per-line breakdown into a
    // single "professional services" row; detailed (default) itemizes.
    const summary = data.format === 'summary';
    let y = 220;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('DESCRIPTION', 50, y);
    doc.text('AMOUNT', 380, y, { align: 'right', width: 165 });
    doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke();
    y += 24;
    doc.fontSize(10).font('Helvetica');
    if (lines.length === 0) {
        doc.text('No billable line items.', 50, y);
        y += 18;
    } else if (summary) {
        const sum = money.sum(lines.map((l) => (l.amount == null ? 0 : l.amount)));
        doc.text(`Professional services (${lines.length} item${lines.length === 1 ? '' : 's'})`, 50, y, { width: 320 });
        doc.text(usd(sum), 380, y, { align: 'right', width: 165 });
        y += 18;
    } else {
        for (const line of lines.slice(0, MAX_PDF_LINES)) {
            doc.text(clip(line.description, MAX_DESC_CHARS), 50, y, { width: 320 });
            doc.text(usd(line.amount), 380, y, { align: 'right', width: 165 });
            y += 18;
        }
        if (lines.length > MAX_PDF_LINES) {
            doc.text(`… and ${lines.length - MAX_PDF_LINES} more line item(s) not shown — see the detailed export.`,
                50, y, { width: 495 });
            y += 18;
        }
    }

    // ---- Totals ----
    y += 10;
    doc.moveTo(330, y).lineTo(545, y).stroke();
    y += 10;
    const totalRow = (label, value, bold) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
        doc.text(label, 330, y, { width: 100 });
        doc.text(value, 430, y, { align: 'right', width: 115 });
        y += 16;
    };
    totalRow('Subtotal', usd(totals.subtotal));
    totalRow('Tax', usd(totals.tax));
    totalRow('Total', usd(totals.total), true);
    if (payment.amountPaid != null && payment.amountPaid !== 0) {
        totalRow('Paid', usd(payment.amountPaid));
    }
    totalRow('Balance Due', usd(payment.balance != null ? payment.balance : totals.total), true);

    // ---- Notes / narrative (per-invoice, #423) ----
    if (invoice.notes) {
        y += 24;
        doc.fillColor('#000').fontSize(9).font('Helvetica-Bold').text('NOTES', 50, y);
        y += 14;
        doc.fontSize(9).font('Helvetica').text(clip(invoice.notes, MAX_NOTES_CHARS), 50, y, { width: 495 });
    }

    // ---- Footer: company narrative/branding, else a default (#423) ----
    doc.fontSize(8).font('Helvetica').fillColor('#666')
        .text(company.footer || 'Thank you for your business.', 50, 780, { align: 'center', width: 495 });
}

/**
 * Render invoice `data` to a PDF Buffer.
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdf(data) {
    // Lazy — keep pdfkit off the hot path for every other endpoint.
    const PDFDocument = require('pdfkit');
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        try {
            drawInvoice(doc, data || {});
            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { renderInvoicePdf, clip, MAX_DESC_CHARS, MAX_NOTES_CHARS, MAX_PDF_LINES };
