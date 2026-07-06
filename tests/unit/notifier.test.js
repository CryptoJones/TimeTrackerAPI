// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { CHANNELS, formatPayload, notify, currentTransport, _captured } from '../../app/services/notifier.js';

describe('notifier (#454)', () => {
    test('channels + payload shape', () => {
        expect(CHANNELS).toEqual(['slack', 'teams']);
        expect(formatPayload('slack', 'hi')).toEqual({ text: 'hi' });
        expect(formatPayload('teams', 42)).toEqual({ text: '42' });
    });

    test('default transport is capture and records dispatched notifications', async () => {
        expect(currentTransport()).toBe('capture');
        const before = _captured().length;
        const res = await notify({ channel: 'slack', text: 'deploy done' });
        expect(res).toMatchObject({ delivered: true, transport: 'capture', channel: 'slack' });
        const after = _captured();
        expect(after.length).toBe(before + 1);
        expect(after[after.length - 1]).toMatchObject({ channel: 'slack', text: 'deploy done' });
    });

    test('rejects an unknown channel or empty text (NOTIFY_INVALID)', async () => {
        await expect(notify({ channel: 'sms', text: 'x' })).rejects.toMatchObject({ code: 'NOTIFY_INVALID' });
        await expect(notify({ channel: 'slack', text: '   ' })).rejects.toMatchObject({ code: 'NOTIFY_INVALID' });
    });
});
