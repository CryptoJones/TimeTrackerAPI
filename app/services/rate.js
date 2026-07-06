// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * rate.js — resolve a time entry's effective billing rate and compute
 * its billable amount, routed through the exact-money service.
 *
 * Rate precedence (first match wins):
 *   1. the entry's OWN BillingType (teBillTypeId — a per-entry override)
 *   2. the entry's Task's rate (taskRate — a per-task rate, #411)
 *   3. the entry's Job's flat rate (jobFlatRate — a per-project rate, #410)
 *   4. the entry's Customer's default rate (custDefaultRate — a client
 *      rate card, #413)
 *   5. the entry's Worker's Role rate (roleRate — a role rate card, #412)
 *   6. the entry's Worker's default BillingType (workerDefaultBillType)
 *
 * These functions are PURE: the caller eager-loads the associations
 * (entry.billingType, entry.task, entry.job, entry.customer,
 * entry.worker.role and entry.worker.defaultBillingType) so rate.js never
 * touches the database and stays trivially unit-testable.
 */

const money = require('./money.js');

/** Coerce a possibly-string numeric rate to a finite number, or null. */
function numOrNull(raw) {
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** The hourly rate on a BillingType instance, or null if absent/invalid. */
function rateOf(billingType) {
    return billingType ? numOrNull(billingType.btHourlyRate) : null;
}

/** The flat per-project rate on a Job instance, or null if absent. */
function flatRateOf(job) {
    return job ? numOrNull(job.jobFlatRate) : null;
}

/** The client's default rate on a Customer instance, or null if absent. */
function clientRateOf(customer) {
    return customer ? numOrNull(customer.custDefaultRate) : null;
}

/** The per-task rate on a Task instance, or null if absent. */
function taskRateOf(task) {
    return task ? numOrNull(task.taskRate) : null;
}

/** The role rate on a Worker's linked Role, or null if absent. */
function roleRateOf(worker) {
    return worker && worker.role ? numOrNull(worker.role.roleRate) : null;
}

/**
 * The effective hourly rate for a time entry, or null when none can be
 * resolved. Expects eager-loaded `entry.billingType` (per-entry),
 * `entry.task` (per-task rate), `entry.job` (per-project flat rate),
 * `entry.customer` (client rate card) and `entry.worker.defaultBillingType`
 * associations; a missing association simply falls through to the next tier.
 */
function resolveHourlyRate(entry) {
    if (!entry) return null;
    const own = rateOf(entry.billingType);
    if (own != null) return own;
    const taskR = taskRateOf(entry.task);
    if (taskR != null) return taskR;
    const project = flatRateOf(entry.job);
    if (project != null) return project;
    const client = clientRateOf(entry.customer);
    if (client != null) return client;
    const role = roleRateOf(entry.worker);
    if (role != null) return role;
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
