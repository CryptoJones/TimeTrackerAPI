// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Convention guard: money is stored exact-decimal, never as a float. Every
// money column is DECIMAL/NUMERIC; the ONLY columns permitted to use a
// floating-point type are fractional QUANTITIES (which are not money). This
// prevents re-introducing the float-storage precision bug fixed in #587 / the
// polPrice follow-up.

import { describe, test, expect } from 'vitest';

const db = require('../../app/config/db.config.js');

describe('money columns are exact-decimal (no float storage)', () => {
    // The only floating-point columns allowed. Both are fractional quantities,
    // not money. Adding an entry here is a conscious "this is a non-money
    // quantity" decision — which is the point: a new float column must be
    // classified, not slip in silently.
    const ALLOWED_FLOAT = new Set([
        'InventoryItem.invitQty',      // stock quantity
        'PurchaseOrderLine.polQty',    // order-line quantity
    ]);

    function typeKey(attr) {
        return String((attr.type && attr.type.key) || (attr.type && attr.type.constructor && attr.type.constructor.key) || attr.type);
    }

    test('no model column uses DOUBLE/FLOAT/REAL except the allowlisted quantities', () => {
        const offenders = [];
        for (const name of Object.keys(db)) {
            const model = db[name];
            if (!model || !model.rawAttributes) continue;
            for (const col of Object.keys(model.rawAttributes)) {
                const t = typeKey(model.rawAttributes[col]);
                if (/FLOAT|DOUBLE|REAL/i.test(t) && !ALLOWED_FLOAT.has(`${name}.${col}`)) {
                    offenders.push(`${name}.${col} :: ${t}`);
                }
            }
        }
        // If this fails, a column uses float storage. Money MUST be DECIMAL(14,2)
        // (see app/services/money.js + the migration convention); a genuinely
        // fractional non-money quantity may be added to ALLOWED_FLOAT above.
        expect(offenders).toEqual([]);
    });

    test('known money columns are DECIMAL', () => {
        const money = [
            ['BillingType', 'btHourlyRate'], ['Job', 'jobFlatRate'], ['Customer', 'custDefaultRate'],
            ['Role', 'roleRate'], ['Task', 'taskRate'], ['CustomerPayment', 'cpayAmount'],
            ['InvoiceJob', 'injbAmount'], ['Expense', 'expAmount'], ['PurchaseOrderLine', 'polPrice'],
            ['Invoice', 'invSubtotal'], ['Invoice', 'invTotal'], ['Retainer', 'retAmount'],
        ];
        for (const [model, col] of money) {
            expect(typeKey(db[model].rawAttributes[col])).toBe('DECIMAL');
        }
    });
});
