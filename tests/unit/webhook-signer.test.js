// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import crypto from 'crypto';
import { buildEvent, signPayload, WEBHOOK_EVENTS } from '../../app/services/webhook-signer.js';

describe('webhook-signer (#69)', () => {
    test('buildEvent wraps event/timestamp/data', () => {
        expect(buildEvent('invoice.created', { id: 1 }, '2026-01-01T00:00:00Z'))
            .toEqual({ event: 'invoice.created', timestamp: '2026-01-01T00:00:00Z', data: { id: 1 } });
    });

    test('signPayload returns sha256=<hmac hex> matching a manual HMAC', () => {
        const body = JSON.stringify({ a: 1 });
        const sig = signPayload('topsecret', body);
        const expected = 'sha256=' + crypto.createHmac('sha256', 'topsecret').update(body).digest('hex');
        expect(sig).toBe(expected);
        expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    test('signPayload is empty when no secret is configured', () => {
        expect(signPayload('', '{}')).toBe('');
        expect(signPayload(null, '{}')).toBe('');
    });

    test('a different secret yields a different signature', () => {
        const body = '{"x":1}';
        expect(signPayload('a', body)).not.toBe(signPayload('b', body));
    });

    test("'*' is a valid subscribable event", () => {
        expect(WEBHOOK_EVENTS).toContain('*');
        expect(WEBHOOK_EVENTS).toContain('invoice.created');
    });
});
