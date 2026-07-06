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

/** 'YYYY-MM-DD' from a Date or ISO string, else null. */
function dateOf(startedAt) {
    if (!startedAt) return null;
    let s;
    if (typeof startedAt === 'string') s = startedAt;
    else if (startedAt instanceof Date) s = startedAt.toISOString();
    else s = String(startedAt);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
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
