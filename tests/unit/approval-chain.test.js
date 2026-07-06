// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { normalizeLevels, nextStep, canApproveAt, MAX_LEVELS } from '../../app/services/approval-chain.js';

describe('approval-chain (#443)', () => {
    test('normalizeLevels renumbers by position and validates roles', () => {
        const { levels } = normalizeLevels([{ approverRole: 'manager' }, { approverRole: 'owner' }]);
        expect(levels).toEqual([
            { level: 1, approverRole: 'manager' },
            { level: 2, approverRole: 'owner' },
        ]);
    });

    test('normalizeLevels rejects empty, oversized, and bad roles', () => {
        expect(normalizeLevels([]).error).toBeTruthy();
        expect(normalizeLevels('nope').error).toBeTruthy();
        expect(normalizeLevels([{ approverRole: 'wizard' }]).error).toBeTruthy();
        const tooMany = Array.from({ length: MAX_LEVELS + 1 }, () => ({ approverRole: 'admin' }));
        expect(normalizeLevels(tooMany).error).toBeTruthy();
    });

    test('nextStep walks levels then reports done', () => {
        const { levels } = normalizeLevels([{ approverRole: 'manager' }, { approverRole: 'owner' }]);
        expect(nextStep(levels, 0)).toMatchObject({ done: false, nextLevel: 1, requiredRole: 'manager', totalLevels: 2 });
        expect(nextStep(levels, 1)).toMatchObject({ done: false, nextLevel: 2, requiredRole: 'owner' });
        expect(nextStep(levels, 2)).toMatchObject({ done: true, nextLevel: null, requiredRole: null });
    });

    test('canApproveAt: more-privileged roles may approve; done chain cannot', () => {
        const { levels } = normalizeLevels([{ approverRole: 'manager' }, { approverRole: 'owner' }]);
        // Level 1 needs manager: manager/admin/owner qualify; member does not.
        expect(canApproveAt(levels, 0, 'manager')).toBe(true);
        expect(canApproveAt(levels, 0, 'admin')).toBe(true);
        expect(canApproveAt(levels, 0, 'member')).toBe(false);
        // Level 2 needs owner: only owner qualifies.
        expect(canApproveAt(levels, 1, 'admin')).toBe(false);
        expect(canApproveAt(levels, 1, 'owner')).toBe(true);
        // Fully approved chain — nobody approves further.
        expect(canApproveAt(levels, 2, 'owner')).toBe(false);
        // Unknown role never qualifies.
        expect(canApproveAt(levels, 0, 'wizard')).toBe(false);
    });
});
