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

const OVER = 1e13; // > NUMERIC(14,2) max (999,999,999,999.99)

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
});
