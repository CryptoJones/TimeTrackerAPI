// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * approval.js — the timesheet approval state machine (#440).
 *
 *   open ─submit─▶ submitted ─approve─▶ approved
 *     ▲                 │
 *     └──── (resubmit)  └─reject─▶ rejected ─submit─▶ submitted
 *
 * A rejected entry can be re-submitted. Approved is terminal. PURE — no
 * DB; the controller loads the row, applies the transition, and saves.
 */

const STATUSES = ['open', 'submitted', 'approved', 'rejected'];

const TRANSITIONS = {
    submit: { from: ['open', 'rejected'], to: 'submitted' },
    approve: { from: ['submitted'], to: 'approved' },
    reject: { from: ['submitted'], to: 'rejected' },
};

/**
 * Apply an action to the current status.
 * @returns { status } on a legal transition, or { error } (a message)
 *   when the action is unknown or illegal from the current state.
 */
function applyAction(current, action) {
    const cur = STATUSES.includes(current) ? current : 'open';
    const t = TRANSITIONS[action];
    if (!t) return { error: `Unknown action '${action}'. Use submit, approve, or reject.` };
    if (!t.from.includes(cur)) {
        return { error: `Cannot ${action} a time entry whose approval status is '${cur}'.` };
    }
    return { status: t.to };
}

module.exports = { applyAction, STATUSES, TRANSITIONS };
