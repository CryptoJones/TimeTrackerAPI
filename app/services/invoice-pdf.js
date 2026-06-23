// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Render an invoice to a PDF Buffer with pdfkit. Pure / DB-free: takes
 * already-loaded rows so it can be unit-tested without a database.
 * pdfkit ships the standard Helvetica fonts, so no font assets or
 * headless browser are needed (keeps the image small + offline).
 */

const money = require('./money.js');

// pdfkit (with fontkit etc.) is a heavy import. Load it lazily inside the
// renderer so merely requiring this module — which the invoice controller
// does at load — doesn't pull pdfkit into every test file / cold start.

function usd(n) {
    return `$${money.roundCents(n).toFixed(2)}`;
}

function lineLabel(line) {
    return line.injbJobId == null ? 'Balance brought forward' : `Job #${line.injbJobId}`;
}

/**
 * @param {object} data { invoice, lines, payments, customer, company, summary }
 * @returns {Promise<Buffer>} the rendered PDF
 */
function renderInvoicePdf(data) {
    const { invoice, lines = [], payments = [], customer = {}, company = {}, summary } = data || {};
    const sum = summary || money.summarize(invoice || {}, lines, payments);

    const PDFDocument = require('pdfkit');
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header: issuing company + invoice meta.
        doc.fontSize(20).text(company.compName || 'Invoice', { align: 'left' });
        doc.moveDown(0.3);
        doc.fontSize(10)
            .text(`Invoice #${invoice ? invoice.invId : ''}`)
            .text(`Date: ${invoice ? invoice.invDate : ''}    Due: ${invoice ? invoice.invDueDate : ''}`)
            .text(`Status: ${sum.status}`);

        // Bill-to.
        doc.moveDown();
        const billTo = [
            customer.custCompanyName,
            [customer.custFName, customer.custLName].filter(Boolean).join(' '),
        ].filter(Boolean).join(' — ');
        doc.fontSize(11).text('Bill To:', { underline: true });
        doc.fontSize(10).text(billTo || `Customer #${invoice ? invoice.invCustId : ''}`);

        // Lines.
        doc.moveDown();
        doc.fontSize(11).text('Lines', { underline: true });
        doc.fontSize(10);
        for (const l of lines) {
            doc.text(`${lineLabel(l)}`, { continued: true })
                .text(`${usd(l.injbAmount)}`, { align: 'right' });
        }
        if (!lines.length) doc.text('(no lines)');

        // Totals.
        doc.moveDown();
        doc.fontSize(11)
            .text(`Total:   ${usd(sum.total)}`, { align: 'right' })
            .text(`Paid:    ${usd(sum.paid)}`, { align: 'right' })
            .text(`Balance: ${usd(sum.balance)}`, { align: 'right' });

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#888')
            .text('Proudly Made in Nebraska. Go Big Red!', { align: 'center' });

        doc.end();
    });
}

module.exports = { renderInvoicePdf, _internals: { usd, lineLabel } };
