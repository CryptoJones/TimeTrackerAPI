// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// #377 — a DB outage must surface as 503, not 403. Uses auth's own
// _setDbForTesting seam to drive the lookups against controlled fixtures.

import { describe, test, expect, vi, afterEach } from 'vitest';
import { isMaster, getCompanyId, attachAuth, isDbUnavailable, _setDbForTesting } from '../../app/middleware/auth.js';

afterEach(() => _setDbForTesting(null));

const connErr = () => Object.assign(new Error('conn'), { name: 'SequelizeConnectionRefusedError' });

describe('auth DB-outage → 503 (#377)', () => {
    test('isDbUnavailable classifies connection errors, not logical ones', () => {
        expect(isDbUnavailable({ name: 'SequelizeConnectionRefusedError' })).toBe(true);
        expect(isDbUnavailable({ name: 'SequelizeHostNotFoundError' })).toBe(true);
        expect(isDbUnavailable({ original: { code: 'ECONNREFUSED' } })).toBe(true);
        expect(isDbUnavailable({ parent: { code: 'ETIMEDOUT' } })).toBe(true);
        expect(isDbUnavailable({ name: 'SequelizeDatabaseError' })).toBe(false); // a query error, not connectivity
        expect(isDbUnavailable(new TypeError('findOne is not a function'))).toBe(false);
        expect(isDbUnavailable(null)).toBe(false);
    });

    test('isMaster / getCompanyId re-throw on outage, sentinel otherwise', async () => {
        const err = connErr();
        _setDbForTesting({ ApiMaster: { findOne: vi.fn().mockRejectedValue(err) }, ApiKey: { findOne: vi.fn().mockRejectedValue(err) } });
        await expect(isMaster('k')).rejects.toBe(err);
        await expect(getCompanyId('k')).rejects.toBe(err);

        const logic = new TypeError('boom');
        _setDbForTesting({ ApiMaster: { findOne: vi.fn().mockRejectedValue(logic) }, ApiKey: { findOne: vi.fn().mockRejectedValue(logic) } });
        expect(await isMaster('k')).toBe(false);
        expect(await getCompanyId('k')).toBe(-1);
    });

    test('attachAuth answers 503 on a DB outage', async () => {
        const err = connErr();
        _setDbForTesting({ ApiMaster: { findOne: vi.fn().mockRejectedValue(err) }, ApiKey: { findOne: vi.fn().mockRejectedValue(err) } });
        const req = { get: (h) => (h === 'authKey' ? 'k' : undefined) };
        const captured = {};
        const res = { status(c) { captured.code = c; return this; }, json(b) { captured.body = b; return this; } };
        let nexted = false;
        await attachAuth(req, res, () => { nexted = true; });
        expect(captured.code).toBe(503);
        expect(nexted).toBe(false);
    });

    test('attachAuth calls next() for a valid scoped key', async () => {
        _setDbForTesting({ ApiMaster: { findOne: vi.fn().mockResolvedValue(null) }, ApiKey: { findOne: vi.fn().mockResolvedValue({ akCompanyId: 7 }) } });
        const req = { get: (h) => (h === 'authKey' ? 'k' : undefined) };
        const res = { status() { return this; }, json() { return this; } };
        let nexted = false;
        await attachAuth(req, res, () => { nexted = true; });
        expect(nexted).toBe(true);
        expect(req.companyId).toBe(7);
        expect(req.isMaster).toBe(false);
    });

    test('attachAuth calls next() when no authKey is sent', async () => {
        const req = { get: () => undefined };
        const res = { status() { return this; }, json() { return this; } };
        let nexted = false;
        await attachAuth(req, res, () => { nexted = true; });
        expect(nexted).toBe(true);
    });
});
