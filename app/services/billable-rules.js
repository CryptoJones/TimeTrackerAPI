// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * billable-rules.js — first-match billable classification (#415). PURE: no
 * DB, no I/O. Given a company's rules and a time-entry context
 * ({ jobId, taskId, category }), return the billable classification from
 * the highest-priority (lowest bruPriority) active rule whose non-null
 * match criteria ALL equal the context. Null criteria are wildcards, so an
 * all-null rule is a catch-all. No rule matches → { billable: null }.
 */

/** Does a rule's (non-null) criteria all match the context? */
function ruleMatches(rule, ctx) {
    const c = ctx || {};
    if (rule.bruMatchJobId != null && Number(rule.bruMatchJobId) !== Number(c.jobId)) return false;
    if (rule.bruMatchTaskId != null && Number(rule.bruMatchTaskId) !== Number(c.taskId)) return false;
    if (rule.bruMatchCategory != null && String(rule.bruMatchCategory) !== String(c.category)) return false;
    return true;
}

/** Evaluate a rule set against a context. @returns { billable, matchedRuleId }. */
function evaluate(rules, ctx) {
    const active = (rules || []).filter((r) => r && r.bruActive !== false && r.bruArch !== true);
    active.sort((a, b) => (
        (Number(a.bruPriority) || 0) - (Number(b.bruPriority) || 0)
        || (Number(a.bruId) || 0) - (Number(b.bruId) || 0)
    ));
    for (const r of active) {
        if (ruleMatches(r, ctx)) {
            return { billable: r.bruBillable === true, matchedRuleId: r.bruId != null ? r.bruId : null };
        }
    }
    return { billable: null, matchedRuleId: null };
}

module.exports = { evaluate, ruleMatches };
