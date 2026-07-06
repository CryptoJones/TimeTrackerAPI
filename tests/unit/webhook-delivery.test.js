// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit coverage for app/services/webhook-delivery.js (#69). The module
// owns the ONE network side effect (a POST via global fetch) and is
// contractually "best-effort": it must never throw and always resolve to a
// result object. We stub global fetch and drive it through the success,
// non-2xx, no-url, no-secret, and failure branches; the signing envelope
// comes from the real webhook-signer (pure), so the signature assertion is
// end-to-end.

import { describe, test, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { deliver } from '../../app/services/webhook-delivery.js';

afterEach(() => vi.unstubAllGlobals());

describe('webhook-delivery: deliver()', () => {
    test('returns {ok:false, error:"no url"} without calling fetch when there is no url', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect(await deliver(null, 'invoice.created', { a: 1 })).toEqual({ ok: false, error: 'no url' });
        expect(await deliver({ whkUrl: '' }, 'invoice.created', {})).toEqual({ ok: false, error: 'no url' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('SSRF: an internal/metadata destination is blocked before fetch is called', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        // A tenant-controlled whkUrl pointed at cloud metadata / loopback
        // must not be reached (see ssrf-guard.js). deliver() stays
        // best-effort: it returns {ok:false} rather than throwing.
        for (const whkUrl of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:6379/', 'http://[::1]/']) {
            const r = await deliver({ whkUrl, whkSecret: 'k' }, 'invoice.created', {});
            expect(r.ok).toBe(false);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // NOTE: the success-path URLs below are public IP literals (not hostnames)
    // so the SSRF guard passes without a real DNS lookup — fetch is mocked, so
    // no connection is actually made.
    test('POSTs a signed JSON envelope and returns {ok, status} on a completed request', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);

        const webhook = { whkId: 7, whkUrl: 'http://8.8.8.8/hook', whkSecret: 's3cr3t' };
        const result = await deliver(webhook, 'invoice.created', { invId: 42 });

        expect(result).toEqual({ ok: true, status: 200 });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe('http://8.8.8.8/hook');
        expect(opts.method).toBe('POST');
        expect(opts.headers['Content-Type']).toBe('application/json');
        expect(opts.headers['X-Webhook-Event']).toBe('invoice.created');

        // Body is the { event, timestamp, data } envelope. The timestamp is
        // an ISO string stamped at send time, so assert its shape, not value.
        const sent = JSON.parse(opts.body);
        expect(sent.event).toBe('invoice.created');
        expect(sent.data).toEqual({ invId: 42 });
        expect(typeof sent.timestamp).toBe('string');
        expect(Number.isNaN(Date.parse(sent.timestamp))).toBe(false);

        // The signature is HMAC-SHA256 over the EXACT bytes that were sent.
        const expectedSig = 'sha256=' + crypto.createHmac('sha256', 's3cr3t').update(opts.body).digest('hex');
        expect(opts.headers['X-Webhook-Signature']).toBe(expectedSig);

        // A timeout signal guards against a hung endpoint stalling the request.
        expect(opts.signal).toBeInstanceOf(AbortSignal);
    });

    test('omits the signature header when the webhook has no secret', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
        vi.stubGlobal('fetch', fetchMock);

        const result = await deliver({ whkUrl: 'http://8.8.8.8/hook', whkId: 1 }, 'payment.recorded', null);
        expect(result).toEqual({ ok: true, status: 204 });

        const [, opts] = fetchMock.mock.calls[0];
        expect(opts.headers).not.toHaveProperty('X-Webhook-Signature');
        // A null data payload still serializes to a valid envelope.
        expect(JSON.parse(opts.body)).toMatchObject({ event: 'payment.recorded', data: null });
    });

    test('reports a non-2xx response as {ok:false, status}', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
        vi.stubGlobal('fetch', fetchMock);
        expect(await deliver({ whkUrl: 'http://8.8.8.8', whkSecret: 'k' }, 'invoice.created', {}))
            .toEqual({ ok: false, status: 500 });
    });

    test('never throws — a fetch rejection resolves to {ok:false, error:<message>}', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        vi.stubGlobal('fetch', fetchMock);
        const result = await deliver({ whkUrl: 'http://8.8.8.8', whkId: 9, whkSecret: 'k' }, 'invoice.created', {});
        expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
    });

    test('falls back to a generic error string when the thrown value has no message', async () => {
        const fetchMock = vi.fn().mockRejectedValue({}); // e.g. a non-Error rejection
        vi.stubGlobal('fetch', fetchMock);
        const result = await deliver({ whkUrl: 'http://8.8.8.8' }, 'invoice.created', {});
        expect(result).toEqual({ ok: false, error: 'delivery failed' });
    });
});
