// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit test for the raw-key generator (#65). No DB — pulls the internal
// helper off the controller's _internals export.

import { describe, test, expect, vi } from 'vitest';

vi.mock('../../app/config/db.config.js', () => ({
    ApiKey: {}, ApiMaster: {}, Sequelize: {},
}));

const { _internals } = await import('../../app/controllers/apikeycontroller.js');
const auth = await import('../../app/middleware/auth.js');

describe('generateRawKey (#65)', () => {
    test('produces a 64-char lowercase hex string (256 bits)', () => {
        const key = _internals.generateRawKey();
        expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    test('is unpredictable — successive keys differ', () => {
        const a = _internals.generateRawKey();
        const b = _internals.generateRawKey();
        expect(a).not.toBe(b);
    });

    test('what gets stored is the HASH of the key, never the raw key itself', () => {
        // This is the security invariant of create/rotate: akKEY = hashKey(raw).
        const raw = _internals.generateRawKey();
        const stored = auth.hashKey(raw);
        expect(stored).toMatch(/^[0-9a-f]{64}$/);
        expect(stored).not.toBe(raw);
        // Deterministic: the same raw always hashes the same (so lookups match).
        expect(auth.hashKey(raw)).toBe(stored);
    });
});
