// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * rate.js — resolve a time entry's effective billing rate and compute
 * its billable amount, routed through the exact-money service.
 *
 * Rate precedence (first match wins):
 *   1. the entry's OWN BillingType (teBillTypeId — a per-entry override)
 *   2. the entry's Worker's default BillingType (workerDefaultBillType)
 *   (A per-project rate is a planned middle tier — backlog #28 — and
 *    slots in between the worker default and "no rate" once Job carries
 *    its own rate.)
 *
 * These functions are PURE: the caller eager-loads the associations
 * (entry.billingType and entry.worker.defaultBillingType) so rate.js
 * never touches the database and stays trivially unit-testable.
 */

const money = require('./money.js');

/** The hourly rate on a BillingType instance, or null if absent/invalid. */
function rateOf(billingType) {
    if (!billingType) return null;
    const raw = billingType.btHourlyRate;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * The effective hourly rate for a time entry, or null when none can be
 * resolved. Expects eager-loaded `entry.billingType` (per-entry) and
 * `entry.worker.defaultBillingType` associations; a missing (or
 * archived, hence unloaded) association simply falls through.
 */
function resolveHourlyRate(entry) {
    if (!entry) return null;
    const own = rateOf(entry.billingType);
    if (own != null) return own;
    return rateOf(entry.worker && entry.worker.defaultBillingType);
}

/**
 * The money this entry contributes to a bill:
 *   - non-billable entry             → 0
 *   - billable but no rate / minutes → null (can't be computed yet)
 *   - otherwise rate × (minutes / 60), rounded to the cent via money.js
 *
 * `rate` defaults to resolveHourlyRate(entry) but may be passed in when
 * the caller already resolved it, to avoid walking the associations
 * twice.
 */
function billableAmount(entry, rate = resolveHourlyRate(entry)) {
    if (!entry || !entry.teBillable) return 0;
    if (rate == null || entry.teMinutes == null) return null;
    return money.multiply(rate, entry.teMinutes / 60);
}

module.exports = { resolveHourlyRate, billableAmount };
