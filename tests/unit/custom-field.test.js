// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { TYPES, ENTITIES, coerceValue, validateAgainstDefs } from '../../app/services/custom-field.js';

describe('custom-field (#409)', () => {
    test('type + entity vocab', () => {
        expect(TYPES).toEqual(['text', 'number', 'date', 'boolean']);
        expect(ENTITIES).toEqual(['customer', 'job', 'timeentry']);
    });

    test('coerceValue by type', () => {
        expect(coerceValue('text', 42)).toEqual({ value: '42' });
        expect(coerceValue('number', '3.5')).toEqual({ value: 3.5 });
        expect(coerceValue('number', 'x')).toEqual({ error: 'must be a number' });
        expect(coerceValue('boolean', 'true')).toEqual({ value: true });
        expect(coerceValue('boolean', 0)).toEqual({ value: false });
        expect(coerceValue('boolean', 'maybe')).toEqual({ error: 'must be a boolean' });
        expect(coerceValue('date', '2026-03-01')).toEqual({ value: '2026-03-01' });
        expect(coerceValue('date', '03/01/2026').error).toBeTruthy();
        expect(coerceValue('bogus', 'x').error).toBeTruthy();
    });

    const DEFS = [
        { cfdName: 'region', cfdType: 'text', cfdRequired: true },
        { cfdName: 'seats', cfdType: 'number', cfdRequired: false },
        { cfdName: 'vip', cfdType: 'boolean', cfdRequired: false },
    ];

    test('validateAgainstDefs coerces knowns and returns values', () => {
        const res = validateAgainstDefs(DEFS, { region: 'EMEA', seats: '10', vip: 'true' });
        expect(res).toEqual({ values: { region: 'EMEA', seats: 10, vip: true } });
    });

    test('validateAgainstDefs enforces required + rejects unknown + bad type', () => {
        expect(validateAgainstDefs(DEFS, { seats: '10' }).errors).toMatchObject({ region: 'is required' });
        expect(validateAgainstDefs(DEFS, { region: 'X', mystery: 1 }).errors).toMatchObject({ mystery: 'unknown custom field' });
        expect(validateAgainstDefs(DEFS, { region: 'X', seats: 'nope' }).errors).toMatchObject({ seats: 'must be a number' });
    });

    test('optional empty fields are skipped', () => {
        expect(validateAgainstDefs(DEFS, { region: 'X' })).toEqual({ values: { region: 'X' } });
    });
});
