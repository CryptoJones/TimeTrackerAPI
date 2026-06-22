// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Restore the time -> job / worker / billing-type relationships that
// the original SQL Server `TimerEntries` table carried and the Node
// redesign dropped (tentJobId, tentWorker, tentBillType). Without
// these, TimeEntry attaches only to a Customer, leaving Worker and
// BillingType orphaned and severing time from the Job -> InvoiceJob ->
// Invoice chain.
//
// Additive + nullable: existing rows keep working untouched, and every
// current endpoint that doesn't set these columns is unaffected. No FK
// constraints are added (the schema models relationships through
// Sequelize associations, not database-level FKs — matching the rest
// of the tables).
//
// Down: drop the three columns. Safe — nothing references them.

'use strict';

const SCHEMA = 'dbo';
const TABLE = 'TimeEntry';
const COLUMNS = ['teJobId', 'teWorkerId', 'teBillTypeId'];

module.exports = {
    async up(queryInterface) {
        const sequelize = queryInterface.sequelize;
        const adds = COLUMNS
            .map((c) => `ADD COLUMN IF NOT EXISTS "${c}" INTEGER`)
            .join(',\n                    ');
        await sequelize.query(`
            ALTER TABLE "${SCHEMA}"."${TABLE}"
                    ${adds}
        `);
    },

    async down(queryInterface) {
        const sequelize = queryInterface.sequelize;
        const drops = COLUMNS
            .map((c) => `DROP COLUMN IF EXISTS "${c}"`)
            .join(',\n                    ');
        await sequelize.query(`
            ALTER TABLE "${SCHEMA}"."${TABLE}"
                    ${drops}
        `);
    },
};
