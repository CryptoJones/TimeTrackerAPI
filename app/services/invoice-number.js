// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * invoice-number.js — per-company invoice numbering (#390).
 *
 * Each Company carries a configurable sequence: a prefix, a zero-pad
 * width, and the next counter value. An invoice is stamped with a
 * human-facing number (e.g. "INV-0001") at creation.
 *
 * `formatNumber` is pure. `allocateNumber` reserves the next value under
 * a row lock (SELECT … FOR UPDATE) inside the caller's transaction, so
 * two invoices created concurrently for the same company can never share
 * a number — the second waits for the first to commit.
 */

/**
 * Format a sequence value as `${prefix}${zero-padded seq}`.
 * Padding only widens; a seq longer than `pad` is printed in full.
 * @param {string|null} prefix
 * @param {number} seq
 * @param {number} pad zero-pad width
 * @returns {string}
 */
function formatNumber(prefix, seq, pad) {
    const p = prefix == null ? '' : String(prefix);
    const n = Number.isFinite(Number(seq)) ? Math.max(Math.trunc(Number(seq)), 0) : 0;
    const width = Number.isFinite(Number(pad)) && Number(pad) > 0 ? Math.trunc(Number(pad)) : 0;
    return p + String(n).padStart(width, '0');
}

/**
 * Reserve and return the next invoice number for a company, advancing
 * its counter. Must be called inside a transaction `t`; takes a row lock
 * on the Company so concurrent allocations serialize. Returns null when
 * the company isn't found (e.g. archived).
 * @param {object} db the db.config module
 * @param {number} companyId
 * @param {import('sequelize').Transaction} t
 * @returns {Promise<string|null>}
 */
async function allocateNumber(db, companyId, t) {
    const company = await db.Company.findByPk(companyId, {
        attributes: ['compId', 'compInvPrefix', 'compInvPad', 'compInvNextSeq'],
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    if (!company) return null;
    const seq = Number.isFinite(Number(company.compInvNextSeq))
        ? Math.trunc(Number(company.compInvNextSeq))
        : 1;
    const number = formatNumber(company.compInvPrefix, seq, company.compInvPad);
    await company.update({ compInvNextSeq: seq + 1 }, { transaction: t });
    return number;
}

module.exports = { formatNumber, allocateNumber };
