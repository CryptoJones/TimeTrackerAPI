// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Billable-classification rules (#415). A BillableRule maps a match on a
// time entry's job / task / category to a default billable/non-billable
// classification. Rules evaluate first-match by priority (like the rate
// resolver). Company-scoped via bruCompId. New table in the increment
// layer; no FK constraints. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'BillableRule', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    bruId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    bruCompId: { type: Sequelize.INTEGER, allowNull: false },
                    bruName: { type: Sequelize.TEXT, allowNull: false },
                    bruPriority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
                    bruMatchJobId: { type: Sequelize.INTEGER, allowNull: true },
                    bruMatchTaskId: { type: Sequelize.INTEGER, allowNull: true },
                    bruMatchCategory: { type: Sequelize.TEXT, allowNull: true },
                    bruBillable: { type: Sequelize.BOOLEAN, allowNull: false },
                    bruActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                    bruArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'BillableRule_scope_idx', fields: ['bruCompId', 'bruArch', 'bruPriority'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
