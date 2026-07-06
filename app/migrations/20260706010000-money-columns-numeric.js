// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Storage consistency (review-log items 3/11): btHourlyRate, cpayAmount, and
// injbAmount were the last three money columns stored as DOUBLE (float) while
// every other money column is NUMERIC(14,2). Convert them so the whole money
// model is exact-decimal at rest. Behaviour-preserving: money.js already
// rounds to cents in computation and the schemas bound the magnitude
// (<= 999,999,999.99), so the `::numeric(14,2)` cast only pins existing values
// to 2 dp — which is how they were already computed. setup/*.sql untouched;
// the migration converts on both fresh (post-setup) and existing databases.

'use strict';

const SCHEMA = 'dbo';
const COLS = [
    ['BillingType', 'btHourlyRate'],
    ['CustomerPayment', 'cpayAmount'],
    ['InvoiceJob', 'injbAmount'],
];

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async (t) => {
            for (const [table, col] of COLS) {
                await queryInterface.sequelize.query(
                    `ALTER TABLE "${SCHEMA}"."${table}" ALTER COLUMN "${col}" TYPE numeric(14,2) USING "${col}"::numeric(14,2);`,
                    { transaction: t },
                );
            }
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async (t) => {
            for (const [table, col] of COLS) {
                await queryInterface.sequelize.query(
                    `ALTER TABLE "${SCHEMA}"."${table}" ALTER COLUMN "${col}" TYPE double precision USING "${col}"::double precision;`,
                    { transaction: t },
                );
            }
        });
    },
};
