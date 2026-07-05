// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Billable expenses with markup (#417). expBillable marks an expense as
// re-billable to the client; expMarkupPct is the markup fraction applied
// on top of cost (0.15 = +15%). expBillable defaults false (existing
// expenses aren't re-billed until opted in); expMarkupPct is nullable
// (NULL = bill at cost). setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const EXPENSE = { tableName: 'Expense', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                EXPENSE, 'expBillable',
                { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                { transaction: t },
            );
            await queryInterface.addColumn(
                EXPENSE, 'expMarkupPct',
                { type: Sequelize.DECIMAL(6, 4), allowNull: true },
                { transaction: t },
            );
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(EXPENSE, 'expMarkupPct', { transaction: t });
            await queryInterface.removeColumn(EXPENSE, 'expBillable', { transaction: t });
        });
    },
};
