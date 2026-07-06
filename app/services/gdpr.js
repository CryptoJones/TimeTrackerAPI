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

// Default rows-per-batch for the streamed GDPR export. Large enough to keep
// round-trips low, small enough that peak memory is bounded regardless of a
// customer's total history (audit item #3 — the pre-stream findAll loaded the
// whole relation into memory, an OOM/DoS vector).
const EXPORT_BATCH_SIZE = 500;

/**
 * Stream one relation as a comma-separated run of JSON objects (no enclosing
 * brackets — the caller writes those). Keyset pagination over the model's
 * primary key means peak memory is O(batchSize), not O(total rows), and the
 * `pk > lastId` cursor can neither skip nor duplicate rows the way OFFSET can.
 *
 * Pure-ish + injectable for tests: `model` need only expose
 * `primaryKeyAttribute` + `findAll({where, order, limit})`, `Op` supplies the
 * `gt` operator, and `write(str)` receives each chunk. Returns the row count.
 */
async function streamRelationArray(model, baseWhere, Op, write, batchSize = EXPORT_BATCH_SIZE) {
    const pk = model.primaryKeyAttribute;
    let lastId = 0;
    let first = true;
    let total = 0;
    for (;;) {
        const rows = await model.findAll({
            where: { ...baseWhere, [pk]: { [Op.gt]: lastId } },
            order: [[pk, 'ASC']],
            limit: batchSize,
        });
        if (!rows || rows.length === 0) break;
        for (const row of rows) {
            write((first ? '' : ',') + JSON.stringify(row));
            first = false;
            lastId = typeof row.get === 'function' ? row.get(pk) : row[pk];
        }
        total += rows.length;
        if (rows.length < batchSize) break;
    }
    return total;
}

module.exports = {
    PII_FIELDS, NON_NULL_PII, PLACEHOLDER, anonymizedValues,
    EXPORT_BATCH_SIZE, streamRelationArray,
};
