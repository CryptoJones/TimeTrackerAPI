// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Expense entity (#416): a cost incurred on behalf of a client/project.
// Scoped to a company (expCompId); optionally linked to a Customer
// (expCustId) and a Job (expJobId). A new table, created here in the
// increment layer (like the 20260517 PurchaseOrder tables); no FK
// constraints — enforced at the app layer. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Expense', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    expId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    expCompId: { type: Sequelize.INTEGER, allowNull: false },
                    expCustId: { type: Sequelize.INTEGER, allowNull: true },
                    expJobId: { type: Sequelize.INTEGER, allowNull: true },
                    expCategory: { type: Sequelize.TEXT, allowNull: true },
                    expDescription: { type: Sequelize.TEXT, allowNull: true },
                    expDate: { type: Sequelize.DATEONLY, allowNull: false },
                    expAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
                    expArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'Expense_compId_arch_idx',
                fields: ['expCompId', 'expArch'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
