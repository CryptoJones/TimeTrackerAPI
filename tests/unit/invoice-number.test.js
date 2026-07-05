// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for invoice-number formatting (app/services/invoice-number.js).
// allocateNumber touches the DB (row lock) and is covered by the invoice
// create/roll-up flows in CI; formatNumber is pure and tested here.

import { describe, test, expect } from 'vitest';

const { formatNumber } = require('../../app/services/invoice-number.js');

describe('invoice-number.formatNumber', () => {
    test('prefix + zero-padded sequence', () => {
        expect(formatNumber('INV-', 1, 4)).toBe('INV-0001');
        expect(formatNumber('INV-', 42, 4)).toBe('INV-0042');
        expect(formatNumber('INV-', 1000, 4)).toBe('INV-1000');
    });

    test('padding only widens — a longer sequence prints in full', () => {
        expect(formatNumber('INV-', 12345, 4)).toBe('INV-12345');
    });

    test('empty / null prefix and zero pad', () => {
        expect(formatNumber('', 5, 0)).toBe('5');
        expect(formatNumber(null, 7, 3)).toBe('007');
    });

    test('arbitrary prefix strings pass through verbatim', () => {
        expect(formatNumber('2026/', 3, 5)).toBe('2026/00003');
    });

    test('non-finite / negative inputs degrade safely', () => {
        expect(formatNumber('INV-', NaN, 4)).toBe('INV-0000');
        expect(formatNumber('INV-', -3, 4)).toBe('INV-0000');
        expect(formatNumber('INV-', 5, NaN)).toBe('INV-5');
    });
});
