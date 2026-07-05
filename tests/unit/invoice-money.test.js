// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// The Invoice money columns (invSubtotal / invTax / invTotal) are
// NUMERIC(14,2); pg returns NUMERIC as a string. These getters must
// hand the API a Number (or null), never the raw string or NaN. No DB —
// Model.build() applies getters without opening a connection.

import { describe, test, expect } from 'vitest';

const db = require('../../app/config/db.config.js');

describe('Invoice money columns: NUMERIC → Number getters', () => {
    test('getters coerce pg NUMERIC strings to Number', () => {
        const inv = db.Invoice.build({
            invSubtotal: '123.45',
            invTax: '10.00',
            invTotal: '133.45',
        });
        expect(inv.invSubtotal).toBe(123.45);
        expect(inv.invTax).toBe(10);
        expect(inv.invTotal).toBe(133.45);
    });

    test('unset money columns read as null, not NaN', () => {
        const inv = db.Invoice.build({});
        expect(inv.invSubtotal).toBeNull();
        expect(inv.invTax).toBeNull();
        expect(inv.invTotal).toBeNull();
    });
});
