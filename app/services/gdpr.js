// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * gdpr.js — data-subject helpers for GDPR export/erase (#461). PURE: no
 * DB, no I/O. `anonymizedValues()` returns the column→value map used to
 * scrub a Customer's personal data on a right-to-erasure request, while
 * financial records (invoices, payments) are retained for accounting/tax
 * obligations. NOT-NULL columns get a placeholder; nullable ones null out.
 */

// Personal data on a Customer row.
const PII_FIELDS = [
    'custCompanyName', 'custFName', 'custLName',
    'custAddress1', 'custAddress2', 'custCity', 'custState', 'custZip',
    'custPhone', 'custEmail',
];

// These are text NOT NULL in the DB — they must get a placeholder, not null.
const NON_NULL_PII = ['custCompanyName', 'custFName', 'custLName'];

const PLACEHOLDER = '[erased]';

/** The column→value map that scrubs a customer's PII. */
function anonymizedValues() {
    const out = {};
    for (const field of PII_FIELDS) {
        out[field] = NON_NULL_PII.includes(field) ? PLACEHOLDER : null;
    }
    return out;
}

module.exports = { PII_FIELDS, NON_NULL_PII, PLACEHOLDER, anonymizedValues };
