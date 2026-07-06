// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { sign, verify } from '../../app/services/jwt.js';

const SECRET = 'unit-test-secret';

describe('jwt (#445)', () => {
    test('sign → verify round-trips the payload and adds iat/exp', () => {
        const token = sign({ sub: 42, userCompId: 7 }, SECRET, 3600);
        expect(token.split('.')).toHaveLength(3);
        const payload = verify(token, SECRET);
        expect(payload.sub).toBe(42);
        expect(payload.userCompId).toBe(7);
        expect(typeof payload.iat).toBe('number');
        expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    test('verify rejects a wrong secret', () => {
        const token = sign({ sub: 1 }, SECRET, 3600);
        expect(verify(token, 'different-secret')).toBeNull();
    });

    test('verify rejects a tampered payload', () => {
        const token = sign({ sub: 1 }, SECRET, 3600);
        const parts = token.split('.');
        const forged = Buffer.from(JSON.stringify({ sub: 999, exp: 9999999999 })).toString('base64url');
        expect(verify(`${parts[0]}.${forged}.${parts[2]}`, SECRET)).toBeNull();
    });

    test('verify rejects an expired token', () => {
        const token = sign({ sub: 1 }, SECRET, -10); // already expired
        expect(verify(token, SECRET)).toBeNull();
    });

    test('verify rejects malformed input', () => {
        expect(verify('not.a.jwt', SECRET)).toBeNull();
        expect(verify('', SECRET)).toBeNull();
        expect(verify(null, SECRET)).toBeNull();
    });
});
