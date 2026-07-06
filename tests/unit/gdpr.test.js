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
