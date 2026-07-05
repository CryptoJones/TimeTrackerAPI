// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Per-project budgets (#434). jobBudgetMinutes caps effort (hours),
// jobBudgetAmount caps billable value. Either or both may be set; both
// nullable (NULL = no budget on that dimension). The budget report
// compares actuals to these. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const JOB = { tableName: 'Job', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                JOB, 'jobBudgetMinutes',
                { type: Sequelize.INTEGER, allowNull: true },
                { transaction: t },
            );
            await queryInterface.addColumn(
                JOB, 'jobBudgetAmount',
                { type: Sequelize.DECIMAL(14, 2), allowNull: true },
                { transaction: t },
            );
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(JOB, 'jobBudgetAmount', { transaction: t });
            await queryInterface.removeColumn(JOB, 'jobBudgetMinutes', { transaction: t });
        });
    },
};
