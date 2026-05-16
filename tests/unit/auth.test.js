// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit-level tests for the shared auth middleware helpers.

import { describe, test, expect, vi } from 'vitest';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn(),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: {},
    Customer: {}, ApiKey: {}, ApiMaster: {}, TimeEntry: {},
}));

describe('auth.isMaster', () => {
    test('returns false for empty or missing input', async () => {
        const auth = await import('../../app/middleware/auth.js');
        expect(await auth.isMaster('')).toBe(false);
        expect(await auth.isMaster(null)).toBe(false);
        expect(await auth.isMaster(undefined)).toBe(false);
    });

    test('returns false when no row matches', async () => {
        const db = await import('../../app/config/db.config.js');
        const auth = await import('../../app/middleware/auth.js');
        db.sequelize.query.mockResolvedValueOnce([]);
        expect(await auth.isMaster('some-key')).toBe(false);
    });

    // The "row found → returns true" path requires the vi.mock to
    // actually engage with the controller's CJS require chain, which
    // is finicky in this codebase. Integration tests against a real
    // Postgres cover this path; the unit test here is intentionally
    // limited to the no-DB code branches.

    test('returns false when amId is zero or non-numeric', async () => {
        const db = await import('../../app/config/db.config.js');
        const auth = await import('../../app/middleware/auth.js');
        db.sequelize.query.mockResolvedValueOnce([{ amId: 0 }]);
        expect(await auth.isMaster('k')).toBe(false);
        db.sequelize.query.mockResolvedValueOnce([{ amId: 'oops' }]);
        expect(await auth.isMaster('k')).toBe(false);
    });

    test('swallows DB errors and returns false (does not throw)', async () => {
        const db = await import('../../app/config/db.config.js');
        const auth = await import('../../app/middleware/auth.js');
        db.sequelize.query.mockRejectedValueOnce(new Error('connection refused'));
        expect(await auth.isMaster('k')).toBe(false);
    });
});

describe('auth.getCompanyId', () => {
    test('returns -1 for empty input', async () => {
        const auth = await import('../../app/middleware/auth.js');
        expect(await auth.getCompanyId('')).toBe(-1);
        expect(await auth.getCompanyId(null)).toBe(-1);
    });

    test('returns -1 when no row matches', async () => {
        const db = await import('../../app/config/db.config.js');
        const auth = await import('../../app/middleware/auth.js');
        db.sequelize.query.mockResolvedValueOnce([]);
        expect(await auth.getCompanyId('k')).toBe(-1);
    });

    // The "row found → returns the company id" path requires the
    // vi.mock to engage with the CJS require chain (see equivalent
    // skip in isMaster above). Integration tests cover this path.

    test('returns -1 for non-positive or non-numeric company id', async () => {
        const db = await import('../../app/config/db.config.js');
        const auth = await import('../../app/middleware/auth.js');
        db.sequelize.query.mockResolvedValueOnce([{ akCompanyId: 0 }]);
        expect(await auth.getCompanyId('k')).toBe(-1);
        db.sequelize.query.mockResolvedValueOnce([{ akCompanyId: null }]);
        expect(await auth.getCompanyId('k')).toBe(-1);
        db.sequelize.query.mockResolvedValueOnce([{ akCompanyId: 'wat' }]);
        expect(await auth.getCompanyId('k')).toBe(-1);
    });
});

describe('auth.requireAuthKey middleware', () => {
    test('403s when no authKey header is present', async () => {
        const auth = await import('../../app/middleware/auth.js');
        const req = { get: () => undefined };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        const next = vi.fn();
        auth.requireAuthKey(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('calls next() and stashes req.authKey when present', async () => {
        const auth = await import('../../app/middleware/auth.js');
        const req = { get: (h) => (h === 'authKey' ? 'value' : undefined) };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        const next = vi.fn();
        auth.requireAuthKey(req, res, next);
        expect(req.authKey).toBe('value');
        expect(next).toHaveBeenCalledTimes(1);
    });
});
