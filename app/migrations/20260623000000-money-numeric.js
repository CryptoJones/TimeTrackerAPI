// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Money correctness: convert the amount columns from float/double to
// NUMERIC(14,2) so cents arithmetic is exact (a billing product must
// never accumulate binary-float drift). Covers the columns in the
// invoicing flow: InvoiceJob.injbAmount, CustomerPayment.cpayAmount,
// BillingType.btHourlyRate.
//
// The Sequelize models pair these with a getter that returns a JS
// Number, so the API/JSON representation is unchanged (numbers, not the
// strings node-postgres would otherwise yield for NUMERIC).
//
// USING (...::numeric) casts existing values in place; down restores
// double precision.

'use strict';

const SCHEMA = 'dbo';
const COLS = [
    ['InvoiceJob', 'injbAmount'],
    ['CustomerPayment', 'cpayAmount'],
    ['BillingType', 'btHourlyRate'],
];

module.exports = {
    async up(queryInterface) {
        const q = queryInterface.sequelize;
        for (const [table, col] of COLS) {
            await q.query(`
                ALTER TABLE "${SCHEMA}"."${table}"
                    ALTER COLUMN "${col}" TYPE NUMERIC(14,2) USING ("${col}"::numeric)
            `);
        }
    },

    async down(queryInterface) {
        const q = queryInterface.sequelize;
        for (const [table, col] of COLS) {
            await q.query(`
                ALTER TABLE "${SCHEMA}"."${table}"
                    ALTER COLUMN "${col}" TYPE DOUBLE PRECISION USING ("${col}"::double precision)
            `);
        }
    },
};
