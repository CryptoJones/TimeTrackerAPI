// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import crypto from 'node:crypto';
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

    test('verify rejects a validly-signed token that lacks an exp claim (fail-closed)', () => {
        // Mint a token with a CORRECT HMAC signature but no exp — it would
        // otherwise never expire. verify must reject it, not accept it.
        const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
        const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, iat: 1 })}`; // no exp
        const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
        expect(verify(`${data}.${sig}`, SECRET)).toBeNull();

        // A non-numeric exp is likewise rejected.
        const data2 = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, exp: 'soon' })}`;
        const sig2 = crypto.createHmac('sha256', SECRET).update(data2).digest('base64url');
        expect(verify(`${data2}.${sig2}`, SECRET)).toBeNull();
    });
});
