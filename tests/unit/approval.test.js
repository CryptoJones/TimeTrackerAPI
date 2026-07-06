// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the approval state machine (app/services/approval.js).

import { describe, test, expect } from 'vitest';

const { applyAction } = require('../../app/services/approval.js');

describe('approval.applyAction', () => {
    test('the happy path: open → submitted → approved', () => {
        expect(applyAction('open', 'submit')).toEqual({ status: 'submitted' });
        expect(applyAction('submitted', 'approve')).toEqual({ status: 'approved' });
    });

    test('reject sends submitted → rejected, and rejected can re-submit', () => {
        expect(applyAction('submitted', 'reject')).toEqual({ status: 'rejected' });
        expect(applyAction('rejected', 'submit')).toEqual({ status: 'submitted' });
    });

    test('illegal transitions error (no state change)', () => {
        expect(applyAction('open', 'approve').error).toMatch(/Cannot approve/);
        expect(applyAction('approved', 'reject').error).toMatch(/Cannot reject/);
        expect(applyAction('open', 'reject').error).toMatch(/Cannot reject/);
    });

    test('unknown action errors; unknown current status treated as open', () => {
        expect(applyAction('submitted', 'bogus').error).toMatch(/Unknown action/);
        expect(applyAction(null, 'submit')).toEqual({ status: 'submitted' });
    });
});
