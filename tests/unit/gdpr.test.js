// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { PII_FIELDS, NON_NULL_PII, PLACEHOLDER, anonymizedValues } from '../../app/services/gdpr.js';

describe('gdpr (#461)', () => {
    test('anonymizedValues covers every PII field and nothing else', () => {
        const v = anonymizedValues();
        expect(Object.keys(v).sort()).toEqual([...PII_FIELDS].sort());
        // Financial / identity columns are untouched.
        expect('custDefaultRate' in v).toBe(false);
        expect('custCompId' in v).toBe(false);
        expect('custId' in v).toBe(false);
    });

    test('NOT-NULL columns get the placeholder; nullable ones null out', () => {
        const v = anonymizedValues();
        for (const f of NON_NULL_PII) expect(v[f]).toBe(PLACEHOLDER);
        expect(v.custEmail).toBeNull();
        expect(v.custPhone).toBeNull();
        expect(v.custAddress1).toBeNull();
        expect(v.custZip).toBeNull();
    });
});

// Regression guard: pin PII_FIELDS against the ACTUAL Customer columns, not
// against itself. The original unit test only checked anonymizedValues()
// vs PII_FIELDS — so a future PII column added to the model but forgotten
// in PII_FIELDS would leave residual personal data after a right-to-erasure
// and no test would fail. This closes that gap.
describe('gdpr scrub covers every Customer PII column (regression guard)', () => {
    // db.config defines every model at require-time; rawAttributes is
    // available without a live DB connection.
    const db = require('../../app/config/db.config.js');

    // Columns on Customer that are deliberately NOT personal data. Adding an
    // entry here is a conscious "this is not PII" decision — which is exactly
    // the point: a new column must be classified, not silently ignored.
    const NON_PII = new Set([
        'custId',          // primary key
        'custArch',        // soft-delete flag
        'custCompId',      // tenant scope (FK)
        'custDefaultRate', // billing rate — not personal data
        'createdAt',
        'updatedAt',
    ]);

    test('PII_FIELDS equals (Customer columns − non-PII allowlist)', () => {
        const cols = Object.keys(db.Customer.rawAttributes);
        const expectedPII = cols.filter((c) => !NON_PII.has(c)).sort();
        // If this fails, a column was added to the Customer model: either add
        // it to gdpr.js PII_FIELDS (if it holds personal data) or to NON_PII
        // above (if it does not). Silence here would mean a right-to-erasure
        // request leaves residual PII behind.
        expect([...PII_FIELDS].sort()).toEqual(expectedPII);
    });
});
