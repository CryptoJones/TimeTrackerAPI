// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the outbound-request SSRF guard (app/services/ssrf-guard.js).
// Pins the denylist + scheme + redirect re-validation so a tenant webhook
// URL can never reach loopback / link-local / private / metadata hosts.

import { describe, test, expect, afterEach, vi } from 'vitest';

const { isBlockedIp, assertPublicUrl, safeFetch, SsrfBlockedError } = require('../../app/services/ssrf-guard.js');

describe('isBlockedIp', () => {
    test.each([
        '127.0.0.1', '127.5.6.7', '10.0.0.5', '172.16.0.1', '172.31.255.255',
        '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '255.255.255.255',
        '224.0.0.1', '240.0.0.1',
        '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
        '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '::ffff:127.0.0.1', '::ffff:7f00:1',
    ])('blocks non-public %s', (ip) => {
        expect(isBlockedIp(ip)).toBe(true);
    });

    test.each([
        '8.8.8.8', '1.1.1.1', '93.184.216.34', '203.0.114.1',
        '2606:4700:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808',
    ])('allows public %s', (ip) => {
        expect(isBlockedIp(ip)).toBe(false);
    });

    test('fails closed on a non-IP string', () => {
        expect(isBlockedIp('not-an-ip')).toBe(true);
        expect(isBlockedIp('')).toBe(true);
    });
});

describe('assertPublicUrl', () => {
    test.each([
        'http://127.0.0.1:6379/',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/',
        'http://10.0.0.5/internal',
        'http://[::ffff:169.254.169.254]/',
    ])('rejects internal literal %s', async (url) => {
        await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(SsrfBlockedError);
    });

    test.each(['file:///etc/passwd', 'gopher://x/', 'ftp://host/'])('rejects non-http(s) scheme %s', async (url) => {
        await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(SsrfBlockedError);
    });

    test('rejects a malformed url', async () => {
        await expect(assertPublicUrl('http://')).rejects.toBeInstanceOf(SsrfBlockedError);
    });

    test('allows a public IP literal', async () => {
        await expect(assertPublicUrl('http://8.8.8.8/hook')).resolves.toBeDefined();
    });
});

describe('safeFetch', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    test('blocks a direct internal URL without ever calling fetch', async () => {
        const spy = vi.fn();
        vi.stubGlobal('fetch', spy);
        await expect(safeFetch('http://127.0.0.1/')).rejects.toBeInstanceOf(SsrfBlockedError);
        expect(spy).not.toHaveBeenCalled();
    });

    test('blocks a public → internal redirect (re-validates each hop)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 302, ok: false, headers: { get: () => 'http://127.0.0.1/latest/meta-data/' },
        }));
        await expect(safeFetch('http://8.8.8.8/hook')).rejects.toBeInstanceOf(SsrfBlockedError);
    });

    test('caps redirect chains even among public hosts', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 302, ok: false, headers: { get: () => 'http://1.1.1.1/next' },
        }));
        await expect(safeFetch('http://8.8.8.8/hook', {}, 3)).rejects.toThrow(/too many redirects/);
    });

    test('returns the response for a public non-redirect destination', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, headers: { get: () => null } }));
        const res = await safeFetch('http://8.8.8.8/hook');
        expect(res.status).toBe(200);
    });
});
