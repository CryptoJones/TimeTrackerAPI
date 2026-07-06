// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { evaluate, ruleMatches } from '../../app/services/billable-rules.js';

const RULES = [
    { bruId: 1, bruPriority: 10, bruMatchCategory: 'travel', bruMatchJobId: null, bruMatchTaskId: null, bruBillable: false },
    { bruId: 2, bruPriority: 20, bruMatchJobId: 7, bruMatchCategory: null, bruMatchTaskId: null, bruBillable: true },
    { bruId: 3, bruPriority: 100, bruMatchJobId: null, bruMatchTaskId: null, bruMatchCategory: null, bruBillable: true }, // catch-all
];

describe('billable-rules (#415)', () => {
    test('ruleMatches respects non-null criteria as required, null as wildcard', () => {
        expect(ruleMatches({ bruMatchJobId: 7 }, { jobId: 7 })).toBe(true);
        expect(ruleMatches({ bruMatchJobId: 7 }, { jobId: 8 })).toBe(false);
        expect(ruleMatches({ bruMatchJobId: 7 }, {})).toBe(false);
        expect(ruleMatches({ bruMatchJobId: null }, { jobId: 8 })).toBe(true); // wildcard
    });

    test('first match by priority wins', () => {
        expect(evaluate(RULES, { category: 'travel' })).toEqual({ billable: false, matchedRuleId: 1 });
        expect(evaluate(RULES, { jobId: 7 })).toEqual({ billable: true, matchedRuleId: 2 });
    });

    test('falls through to the catch-all', () => {
        expect(evaluate(RULES, { jobId: 99, category: 'dev' })).toEqual({ billable: true, matchedRuleId: 3 });
    });

    test('priority ordering is by number, not array order', () => {
        const shuffled = [RULES[2], RULES[1], RULES[0]];
        expect(evaluate(shuffled, { category: 'travel' }).matchedRuleId).toBe(1);
    });

    test('inactive/archived rules are skipped; empty set → null', () => {
        const inactive = [{ bruId: 5, bruPriority: 1, bruMatchCategory: 'travel', bruBillable: false, bruActive: false }];
        expect(evaluate(inactive, { category: 'travel' })).toEqual({ billable: null, matchedRuleId: null });
        expect(evaluate([], { jobId: 1 })).toEqual({ billable: null, matchedRuleId: null });
    });
});
