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

const usd = (n) => (n == null ? '—' : '$' + money.toFixedString(n));

function drawInvoice(doc, data) {
    const company = data.company || {};
    const customer = data.customer || {};
    const invoice = data.invoice || {};
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const totals = data.totals || {};
    const payment = data.payment || {};

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
    }
    for (const line of lines) {
        doc.text(String(line.description || ''), 50, y, { width: 320 });
        doc.text(usd(line.amount), 380, y, { align: 'right', width: 165 });
        y += 18;
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

    // ---- Footer ----
    doc.fontSize(8).font('Helvetica').fillColor('#666')
        .text('Thank you for your business.', 50, 780, { align: 'center', width: 495 });
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

module.exports = { renderInvoicePdf };
