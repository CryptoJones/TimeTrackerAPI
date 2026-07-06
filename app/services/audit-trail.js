// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * audit-trail.js — DCAA-grade audit helpers (#462). PURE: no DB, no I/O.
 * `entityIdOf` pulls the touched record id from a /v1/<entity>/<id> path
 * (so the audit middleware can stamp alogEntityId); `diffFields` computes
 * the before/after field changes a DCAA trail must retain.
 */

/** The numeric record id in a /v1/<entity>/<id>[/...] path, or null. */
function entityIdOf(path) {
    const m = /^\/v1\/[a-zA-Z-]+\/(\d+)(?:\/|$|\?)/.exec(path || '');
    return m ? Number(m[1]) : null;
}

function valEqual(x, y) {
    if (x === y) return true;
    if (x == null && y == null) return true;
    if (x == null || y == null) return false;
    if (typeof x === 'object' || typeof y === 'object') return JSON.stringify(x) === JSON.stringify(y);
    return false;
}

/**
 * Field-level changes between two states: { field: { from, to } } for
 * every key whose value differs. Missing keys read as null.
 */
function diffFields(before, after) {
    const b = (before && typeof before === 'object') ? before : {};
    const a = (after && typeof after === 'object') ? after : {};
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    const changes = {};
    for (const k of keys) {
        const from = b[k];
        const to = a[k];
        if (!valEqual(from, to)) {
            changes[k] = { from: from === undefined ? null : from, to: to === undefined ? null : to };
        }
    }
    return changes;
}

/** True when `before` and `after` differ in any field. */
function hasChanges(before, after) {
    return Object.keys(diffFields(before, after)).length > 0;
}

module.exports = { entityIdOf, diffFields, hasChanges };
