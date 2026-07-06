// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Task / activity entity (#407): a unit of work under a Job. Scoped to a
// company through taskJobId → Job → Customer. A new table in the
// increment layer (like the Expense/PurchaseOrder tables); no FK
// constraints — enforced at the app layer. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Task', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    taskId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    taskJobId: { type: Sequelize.INTEGER, allowNull: false },
                    taskName: { type: Sequelize.TEXT, allowNull: false },
                    taskDesc: { type: Sequelize.TEXT, allowNull: true },
                    taskArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'Task_jobId_arch_idx',
                fields: ['taskJobId', 'taskArch'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
