// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * time-lock.js — is a time entry frozen? (#441)
 *
 * Two ways an entry is locked against create / edit / delete:
 *   1. it's been APPROVED (#440) — final, no more changes, or
 *   2. it falls in a CLOSED PERIOD — its date is on or before the
 *      company's compTimeLockDate.
 *
 * PURE: the controller loads the entry + the company lock date and asks
 * here. Returns a human-readable reason string when locked, else null.
 */

/**
 * The UTC calendar day ('YYYY-MM-DD') of a Date or ISO string, else null.
 *
 * A Date is taken via toISOString (UTC). A string needs care: a bare
 * 'YYYY-MM-DD' is already a zone-free calendar day, but a date-TIME string
 * may carry a zone offset (the Zod `isoDatetime` validator accepts
 * offsets). Both must resolve to the SAME UTC day a Date input would, or an
 * offset like `+05:00` shifts the entry to the wrong day and can slip past
 * the closed-period lock (#441) — e.g. `2026-07-07T01:00:00+05:00` is the
 * instant `2026-07-06T20:00:00Z`, which belongs to the locked day.
 */
function dateOf(startedAt) {
    if (!startedAt) return null;
    if (startedAt instanceof Date) {
        return Number.isNaN(startedAt.getTime()) ? null : startedAt.toISOString().slice(0, 10);
    }
    const s = typeof startedAt === 'string' ? startedAt : String(startedAt);
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
    // Bare calendar day (no time component) — no zone to reconcile.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 10);
    // Date-time string: normalize to the UTC day the instant falls on.
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

/**
 * @param opts { approvalStatus, startedAt, lockDate }
 * @returns a reason string if the entry is locked, else null.
 */
function lockReason(opts) {
    const o = opts || {};
    if (o.approvalStatus === 'approved') {
        return 'This time entry is approved and cannot be changed.';
    }
    if (o.lockDate) {
        const d = dateOf(o.startedAt);
        const lock = dateOf(o.lockDate) || String(o.lockDate).slice(0, 10);
        if (d && lock && d <= lock) {
            return 'This period is locked: the entry date is on or before the company time-lock date.';
        }
    }
    return null;
}

module.exports = { lockReason, dateOf };
