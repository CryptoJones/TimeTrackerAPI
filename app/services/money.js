// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * money.js — exact monetary arithmetic for the billing engine.
 *
 * Money crosses the API boundary as a decimal Number of currency units
 * (e.g. dollars) and is stored in Postgres as NUMERIC(14,2). IEEE-754
 * doubles can't represent most decimal fractions exactly
 * (`0.1 + 0.2 === 0.30000000000000004`), so every operation here
 * converts to integer CENTS, does exact integer math, and converts
 * back — rounding once, deterministically (half away from zero), at
 * each boundary.
 *
 * Range: NUMERIC(14,2) holds up to 12 integer digits, i.e. a cent count
 * up to 10^14. Number.MAX_SAFE_INTEGER is ~9.007*10^15, so integer-cent
 * arithmetic stays exact across any in-range amount (and their sums,
 * within reason). Callers working beyond that range should move to a
 * bigint/decimal representation — out of scope for this product.
 *
 * This module is the single source of truth for billing math: the
 * time→invoice roll-up, tax/discount lines, invoice totals, and
 * payment-balance calculations all round through here so no two call
 * sites disagree on the cent.
 */

const CENTS_PER_UNIT = 100;

/**
 * Coerce an amount (Number, or a NUMERIC string as returned by pg) to a
 * finite Number. Throws on anything non-numeric / non-finite so a bad
 * value fails loudly at the boundary instead of silently poisoning a
 * total with NaN.
 */
function toNumber(amount) {
    const n = typeof amount === 'string' ? Number(amount) : amount;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw new TypeError(`money: expected a finite numeric amount, got ${JSON.stringify(amount)}`);
    }
    return n;
}

/**
 * Round to the nearest integer, half AWAY from zero, so the sign is
 * symmetric (+0.005 → +0.01, -0.005 → -0.01). Math.round rounds half
 * UP (toward +Infinity), which is asymmetric for negatives.
 */
function roundHalfAwayFromZero(n) {
    return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Convert a decimal amount to an integer number of cents. */
function toCents(amount) {
    return roundHalfAwayFromZero(toNumber(amount) * CENTS_PER_UNIT);
}

/** Convert an integer number of cents back to a decimal amount. */
function fromCents(cents) {
    if (!Number.isInteger(cents)) {
        throw new TypeError(`money: fromCents expects an integer, got ${cents}`);
    }
    return cents / CENTS_PER_UNIT;
}

/** Sum any number of amounts, exact to the cent. add() === 0. */
function add(...amounts) {
    return fromCents(amounts.reduce((total, a) => total + toCents(a), 0));
}

/** a − b, exact to the cent. */
function subtract(a, b) {
    return fromCents(toCents(a) - toCents(b));
}

/**
 * amount × factor → money, where `factor` is a plain count (hours,
 * quantity, a tax/markup multiplier), NOT a money value. The product is
 * rounded to the cent once. e.g. multiply(100.00, 1.5) === 150.
 */
function multiply(amount, factor) {
    return fromCents(roundHalfAwayFromZero(toCents(amount) * toNumber(factor)));
}

/** Sum an array of amounts. sum([]) === 0. */
function sum(amounts) {
    if (!Array.isArray(amounts)) {
        throw new TypeError('money: sum expects an array of amounts');
    }
    return add(...amounts);
}

/** Normalize an amount to a clean 2-dp money Number (drops float noise). */
function round(amount) {
    return fromCents(toCents(amount));
}

/** True when two amounts are equal to the cent. */
function isEqual(a, b) {
    return toCents(a) === toCents(b);
}

/**
 * Canonical 2-dp string for display and for writing to a NUMERIC(14,2)
 * column (Postgres accepts the decimal string form). Always two
 * fraction digits: toFixedString(5) === '5.00'.
 */
function toFixedString(amount) {
    return (toCents(amount) / CENTS_PER_UNIT).toFixed(2);
}

module.exports = {
    toNumber,
    toCents,
    fromCents,
    add,
    subtract,
    multiply,
    sum,
    round,
    isEqual,
    toFixedString,
};
