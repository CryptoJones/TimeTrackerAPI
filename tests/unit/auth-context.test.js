// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// #374 — reuse attachAuth's resolved context instead of a second DB lookup.

import { describe, test, expect, vi, afterEach } from 'vitest';
import { masterFromReq, companyIdFromReq, _setDbForTesting } from '../../app/middleware/auth.js';

afterEach(() => _setDbForTesting(null));

describe('auth context reuse (#374)', () => {
    test('masterFromReq returns the cached req.isMaster', async () => {
        expect(await masterFromReq({ isMaster: true }, 'k')).toBe(true);
        expect(await masterFromReq({ isMaster: false }, 'k')).toBe(false);
    });

    test('companyIdFromReq returns the cached req.companyId (incl. the -1 sentinel)', async () => {
        expect(await companyIdFromReq({ companyId: 7 }, 'k')).toBe(7);
        expect(await companyIdFromReq({ companyId: -1 }, 'k')).toBe(-1);
    });

    test('falls back to a live lookup when the context is absent', async () => {
        _setDbForTesting({
            ApiMaster: { findOne: vi.fn().mockResolvedValue({ amId: 3 }) },
            ApiKey: { findOne: vi.fn().mockResolvedValue({ akCompanyId: 9 }) },
        });
        expect(await masterFromReq({}, 'k')).toBe(true);        // no cached isMaster → lookup
        expect(await companyIdFromReq(undefined, 'k')).toBe(9); // no req → lookup
    });

    test('the cached path does NOT touch the database', async () => {
        const findOne = vi.fn().mockRejectedValue(new Error('should not be called'));
        _setDbForTesting({ ApiMaster: { findOne }, ApiKey: { findOne } });
        expect(await masterFromReq({ isMaster: false }, 'k')).toBe(false);
        expect(await companyIdFromReq({ companyId: 5 }, 'k')).toBe(5);
        expect(findOne).not.toHaveBeenCalled();
    });
});
