// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { entityIdOf, diffFields, hasChanges } from '../../app/services/audit-trail.js';

describe('audit-trail (#462)', () => {
    test('entityIdOf extracts the record id from a path', () => {
        expect(entityIdOf('/v1/timeentry/5')).toBe(5);
        expect(entityIdOf('/v1/timeentry/5/approval')).toBe(5);
        expect(entityIdOf('/v1/timeentry/5?x=1')).toBe(5);
        expect(entityIdOf('/v1/timeentry')).toBeNull();
        expect(entityIdOf('/v1/timeentry/bycompany/3')).toBeNull(); // 'bycompany' isn't an id
        expect(entityIdOf('')).toBeNull();
    });

    test('entityIdOf captures the subject id of a nested action (GDPR erase/export)', () => {
        // The right-to-erasure/export path carries the customer id two
        // segments deep; it must be recorded so the DCAA trail names the
        // data subject (previously logged as null).
        expect(entityIdOf('/v1/gdpr/customer/123/erase')).toBe(123);
        expect(entityIdOf('/v1/gdpr/customer/7/export')).toBe(7);
        // A `by*` list qualifier is still NOT treated as a record id.
        expect(entityIdOf('/v1/customer/bycompany/5')).toBeNull();
    });

    test('diffFields reports changed / added / removed fields', () => {
        expect(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: { from: 2, to: 3 } });
        expect(diffFields({ a: 1 }, { a: 1, b: 5 })).toEqual({ b: { from: null, to: 5 } });
        expect(diffFields({ a: 1, b: 2 }, { a: 1 })).toEqual({ b: { from: 2, to: null } });
        expect(diffFields({ a: 1 }, { a: 1 })).toEqual({});
    });

    test('diffFields compares nested objects by value', () => {
        expect(diffFields({ o: { x: 1 } }, { o: { x: 1 } })).toEqual({});
        expect(diffFields({ o: { x: 1 } }, { o: { x: 2 } })).toEqual({ o: { from: { x: 1 }, to: { x: 2 } } });
    });

    test('hasChanges', () => {
        expect(hasChanges({ a: 1 }, { a: 2 })).toBe(true);
        expect(hasChanges({ a: 1 }, { a: 1 })).toBe(false);
        expect(hasChanges(null, null)).toBe(false);
    });
});
