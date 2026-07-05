// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Expense → invoice link (#418). expInvId records the invoice a billable
// expense was rolled into by the time/expense roll-up; NULL = not yet
// invoiced (the "unbilled" marker, mirroring TimeEntry.teInvJobId). A
// plain nullable INTEGER — no physical FK, enforced at the app layer.
// The index backs the "billable, un-invoiced expenses for a customer"
// query. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const EXPENSE = { tableName: 'Expense', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                EXPENSE, 'expInvId',
                { type: Sequelize.INTEGER, allowNull: true },
                { transaction: t },
            );
            await queryInterface.addIndex(EXPENSE, {
                name: 'Expense_custId_invId_idx',
                fields: ['expCustId', 'expInvId'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(EXPENSE, 'Expense_custId_invId_idx', { transaction: t });
            await queryInterface.removeColumn(EXPENSE, 'expInvId', { transaction: t });
        });
    },
};
