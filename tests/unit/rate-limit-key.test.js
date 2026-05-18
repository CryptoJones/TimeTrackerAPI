// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the express-rate-limit key generator. Verifies:
//   - authKey-present requests key by a hash-prefixed string
//   - same authKey → same key (deterministic), regardless of IP
//   - different authKeys → different keys (independent budgets)
//   - no authKey → falls back to IP
//   - raw authKey value NEVER appears in the returned key

import { describe, test, expect } from 'vitest';
import { keyByAuthKeyOrIp } from '../../app/middleware/rate-limit-key.js';

function fakeReq({ authKey, ip } = {}) {
    return {
        get: (h) => (h === 'authKey' ? authKey : undefined),
        ip,
    };
}

describe('keyByAuthKeyOrIp', () => {
    test('returns a `k:` prefixed hash when authKey is set', () => {
        const k = keyByAuthKeyOrIp(fakeReq({ authKey: 'live-token-abc' }));
        expect(k.startsWith('k:')).toBe(true);
        // 16 hex chars after the prefix.
        expect(k).toMatch(/^k:[0-9a-f]{16}$/);
    });

    test('the raw authKey is never in the returned key', () => {
        const secret = 'super-secret-token-xyz';
        const k = keyByAuthKeyOrIp(fakeReq({ authKey: secret }));
        expect(k.includes(secret)).toBe(false);
    });

    test('same authKey → same key regardless of IP', () => {
        const a = keyByAuthKeyOrIp(fakeReq({ authKey: 'tok', ip: '1.2.3.4' }));
        const b = keyByAuthKeyOrIp(fakeReq({ authKey: 'tok', ip: '5.6.7.8' }));
        expect(a).toBe(b);
    });

    test('different authKeys → different keys', () => {
        const a = keyByAuthKeyOrIp(fakeReq({ authKey: 'tok-a' }));
        const b = keyByAuthKeyOrIp(fakeReq({ authKey: 'tok-b' }));
        expect(a).not.toBe(b);
    });

    test('no authKey + present IP → `ip:` prefix with the IP', () => {
        const k = keyByAuthKeyOrIp(fakeReq({ ip: '203.0.113.42' }));
        expect(k).toBe('ip:203.0.113.42');
    });

    test('no authKey + no IP → falls back to "unknown"', () => {
        const k = keyByAuthKeyOrIp(fakeReq({}));
        expect(k).toBe('ip:unknown');
    });

    test('two anonymous requests from the same IP get the same key (per-IP fallback works)', () => {
        const a = keyByAuthKeyOrIp(fakeReq({ ip: '1.1.1.1' }));
        const b = keyByAuthKeyOrIp(fakeReq({ ip: '1.1.1.1' }));
        expect(a).toBe(b);
    });
});
