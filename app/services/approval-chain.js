// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * approval-chain.js — multi-level approval routing (#443). PURE: no DB, no
 * I/O. A chain is an ordered list of levels, each requiring an approver of
 * a given RBAC role (#448). `normalizeLevels` validates/renumbers the
 * input; `nextStep` says which level/role is required next given how many
 * approvals have been recorded; `canApproveAt` checks an actor's role
 * against the next level (more-privileged roles may approve for less).
 */

const rbac = require('./rbac.js');

const MAX_LEVELS = 10;

/**
 * Validate + renumber an input levels array ([{ approverRole }, ...] — the
 * position is the level). @returns { levels } or { error }.
 */
function normalizeLevels(input) {
    if (!Array.isArray(input) || input.length === 0) {
        return { error: 'levels must be a non-empty array.' };
    }
    if (input.length > MAX_LEVELS) {
        return { error: `A chain may have at most ${MAX_LEVELS} levels.` };
    }
    const levels = [];
    for (let i = 0; i < input.length; i++) {
        const role = input[i] && input[i].approverRole;
        if (!rbac.isRole(role)) {
            return { error: `Level ${i + 1}: approverRole must be one of ${rbac.ROLES.join(', ')}.` };
        }
        levels.push({ level: i + 1, approverRole: role });
    }
    return { levels };
}

/** Given normalized levels + count of approvals so far, the next required step. */
function nextStep(levels, approvalsSoFar) {
    const total = Array.isArray(levels) ? levels.length : 0;
    const done = Number(approvalsSoFar) || 0;
    if (done >= total) {
        return { done: true, nextLevel: null, requiredRole: null, totalLevels: total };
    }
    const idx = Math.max(0, done);
    return { done: false, nextLevel: idx + 1, requiredRole: levels[idx].approverRole, totalLevels: total };
}

/** Can an actor with `actorRole` approve the NEXT pending level? */
function canApproveAt(levels, approvalsSoFar, actorRole) {
    const step = nextStep(levels, approvalsSoFar);
    if (step.done || !rbac.isRole(actorRole)) return false;
    // Lower rank index == more privileged; a more-privileged role may approve.
    return rbac.roleRank(actorRole) <= rbac.roleRank(step.requiredRole);
}

module.exports = { MAX_LEVELS, normalizeLevels, nextStep, canApproveAt };
