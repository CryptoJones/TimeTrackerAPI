// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * invoice-status.js — derive an invoice's lifecycle status and
 * outstanding balance from the payments allocated to it (#392's
 * cpayInvId) and its due date.
 *
 * Derivation only — nothing here mutates the invoice. The stored
 * `invPaid` boolean stays a manual operator flag; this is the
 * authoritative, payment-driven view for display.
 *
 * PURE: the caller loads the invoice and its allocated, unarchived
 * payments; this does exact-money summation (money.js) and string
 * comparison. No DB.
 */

const money = require('./money.js');

/**
 * @param {{ total:(number|null), amountPaid:number, dueDate:(string|null), today:(string|null) }} p
 * @returns {'draft'|'sent'|'partial'|'overdue'|'paid'}
 *
 * dueDate / today are 'YYYY-MM-DD' strings — lexicographic order equals
 * chronological order for that fixed shape.
 */
function deriveStatus({ total, amountPaid, dueDate, today }) {
    if (total == null) return 'draft';            // not yet totalled
    if (amountPaid >= total) return 'paid';       // settled (incl. overpaid)
    if (dueDate != null && today != null && dueDate < today) return 'overdue';
    if (amountPaid > 0) return 'partial';
    return 'sent';                                // issued, unpaid, not yet due
}

/**
 * Summarize an invoice's payment position.
 * @param invoice { invTotal:(number|null), invDueDate:(string|null) }
 * @param payments array of allocated, unarchived payments { cpayAmount }
 * @param today 'YYYY-MM-DD'
 * @returns { status, total, amountPaid, balance }
 *   balance is total − amountPaid (null when the invoice has no total).
 */
function summarize(invoice, payments, today) {
    const total = invoice && invoice.invTotal != null ? Number(invoice.invTotal) : null;
    const amountPaid = money.sum((payments || []).map((p) => p.cpayAmount));
    const balance = total == null ? null : money.subtract(total, amountPaid);
    const status = deriveStatus({
        total,
        amountPaid,
        dueDate: invoice ? invoice.invDueDate : null,
        today,
    });
    return { status, total, amountPaid, balance };
}

module.exports = { deriveStatus, summarize };
