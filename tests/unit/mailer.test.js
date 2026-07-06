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

    test('rejects CR/LF in header fields (email header injection guard)', async () => {
        // A newline in subject / from would smuggle an SMTP header (Bcc:, …)
        // or split the body once a real SMTP transport is wired.
        await expect(sendMail({ to: 'a@b.com', subject: 'Invoice\r\nBcc: evil@x.com' }))
            .rejects.toMatchObject({ code: 'EMAIL_INVALID' });
        await expect(sendMail({ to: 'a@b.com', subject: 'ok\ninjected' }))
            .rejects.toMatchObject({ code: 'EMAIL_INVALID' });
        await expect(sendMail({ to: 'a@b.com', subject: 'ok', from: 'a\r\nBcc: e@x.com <a@b.com>' }))
            .rejects.toMatchObject({ code: 'EMAIL_INVALID' });
        // A clean subject containing a company name (with punctuation) still sends.
        const res = await sendMail({ to: 'a@b.com', subject: 'Monthly report — Acme Corp, Inc.', from: 'ok@x.com' });
        expect(res.transport).toBe('capture');
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
