// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect, beforeEach } from 'vitest';
import { sendMail, setTransport, currentTransport, _captured } from '../../app/services/mailer.js';

describe('mailer (#68)', () => {
    beforeEach(() => setTransport(null)); // restore the capture default

    test('defaults to the no-network capture transport', () => {
        expect(currentTransport()).toBe('capture');
    });

    test('sendMail captures a valid message (no network)', async () => {
        const before = _captured().length;
        const res = await sendMail({ to: 'a@b.com', subject: 'Hi', text: 'yo' });
        expect(res.transport).toBe('capture');
        const cap = _captured();
        expect(cap.length).toBe(before + 1);
        expect(cap[cap.length - 1]).toMatchObject({ to: 'a@b.com', subject: 'Hi' });
    });

    test('rejects an invalid recipient with code EMAIL_INVALID', async () => {
        await expect(sendMail({ to: 'nope', subject: 'x' })).rejects.toMatchObject({ code: 'EMAIL_INVALID' });
    });

    test('rejects a missing subject', async () => {
        await expect(sendMail({ to: 'a@b.com' })).rejects.toMatchObject({ code: 'EMAIL_INVALID' });
    });

    test('setTransport swaps the transport and sendMail uses it', async () => {
        const seen = [];
        setTransport({ name: 'stub', async send(m) { seen.push(m); return { ok: true }; } });
        expect(currentTransport()).toBe('stub');
        await sendMail({ to: 'a@b.com', subject: 'S', text: 'T', from: 'me@x.com' });
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ to: 'a@b.com', subject: 'S', text: 'T', from: 'me@x.com' });
    });
});
