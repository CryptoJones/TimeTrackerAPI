// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Rate / money fields are NUMERIC(14,2) columns. Without an upper bound a
// caller could submit an out-of-range value that parses fine but overflows
// the column → a 500 at write time. These pin the schema-level `.max()` so
// an absurd rate returns a clean 400 instead. (Rate-resolution review.)

import { describe, test, expect } from 'vitest';

const { createBillingTypeBody } = require('../../app/schemas/billingtype.schema.js');
const { createRoleBody } = require('../../app/schemas/role.schema.js');
const { createJobBody } = require('../../app/schemas/job.schema.js');
const { createExpenseBody } = require('../../app/schemas/expense.schema.js');
const { createCustomerPaymentBody } = require('../../app/schemas/customerpayment.schema.js');
const { createInvoiceJobBody } = require('../../app/schemas/invoicejob.schema.js');
const { createPhaseBody } = require('../../app/schemas/phase.schema.js');

const OVER = 1e13; // > NUMERIC(14,2) max (999,999,999,999.99)
const HUGE = 1e308; // finite but overflows money.toCents() → Infinity

describe('rate/amount fields reject out-of-range values (NUMERIC(14,2) overflow guard)', () => {
    test('billingtype btHourlyRate: normal accepted, out-of-range rejected', () => {
        expect(createBillingTypeBody.safeParse({ btName: 'Std', btHourlyRate: 250.5 }).success).toBe(true);
        expect(createBillingTypeBody.safeParse({ btName: 'Std', btHourlyRate: 0 }).success).toBe(true); // $0 pro-bono honored
        expect(createBillingTypeBody.safeParse({ btName: 'Std', btHourlyRate: OVER }).success).toBe(false);
    });

    test('role roleRate: out-of-range rejected', () => {
        expect(createRoleBody.safeParse({ roleName: 'Eng', roleRate: 200 }).success).toBe(true);
        expect(createRoleBody.safeParse({ roleName: 'Eng', roleRate: OVER }).success).toBe(false);
    });

    test('job jobFlatRate + jobBudgetAmount: out-of-range rejected', () => {
        expect(createJobBody.safeParse({ jobCustId: 1, jobDesc: 'x', jobFlatRate: 5000 }).success).toBe(true);
        expect(createJobBody.safeParse({ jobCustId: 1, jobDesc: 'x', jobFlatRate: OVER }).success).toBe(false);
        expect(createJobBody.safeParse({ jobCustId: 1, jobDesc: 'x', jobBudgetAmount: OVER }).success).toBe(false);
    });

    test('expense expMarkupPct: a fraction incl. >100% accepted; DECIMAL(6,4) overflow rejected', () => {
        const base = { expDate: '2026-01-01', expAmount: 100 };
        expect(createExpenseBody.safeParse({ ...base, expMarkupPct: 0.15 }).success).toBe(true); // 15%
        expect(createExpenseBody.safeParse({ ...base, expMarkupPct: 1.5 }).success).toBe(true);  // 150% intentional
        expect(createExpenseBody.safeParse({ ...base, expMarkupPct: 100 }).success).toBe(false); // > 99.9999 → 400, not a 500
    });

    test('expAmount / phaseBudgetAmount: out-of-range rejected (money.toCents overflow guard)', () => {
        expect(createExpenseBody.safeParse({ expDate: '2026-01-01', expAmount: 250.5 }).success).toBe(true);
        expect(createExpenseBody.safeParse({ expDate: '2026-01-01', expAmount: OVER }).success).toBe(false);
        expect(createPhaseBody.safeParse({ phaseJobId: 1, phaseName: 'P', phaseBudgetAmount: 5000 }).success).toBe(true);
        expect(createPhaseBody.safeParse({ phaseJobId: 1, phaseName: 'P', phaseBudgetAmount: OVER }).success).toBe(false);
    });

    test('cpayAmount / injbAmount: negatives allowed but a money.toCents-overflowing magnitude is rejected', () => {
        // Negatives are legitimate (payment reversal / credit line) and stay valid.
        expect(createCustomerPaymentBody.safeParse({ cpayCustId: 1, cpayDate: '2026-01-01', cpayAmount: -250 }).success).toBe(true);
        expect(createInvoiceJobBody.safeParse({ injbInvId: 1, injbJobId: 1, injbAmount: -100 }).success).toBe(true);
        // A finite-but-huge value (would overflow money.sum → 500) is rejected with a 400.
        expect(createCustomerPaymentBody.safeParse({ cpayCustId: 1, cpayDate: '2026-01-01', cpayAmount: HUGE }).success).toBe(false);
        expect(createInvoiceJobBody.safeParse({ injbInvId: 1, injbJobId: 1, injbAmount: HUGE }).success).toBe(false);
    });
});
