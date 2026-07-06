// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Multi-level approval chains (#443). An ApprovalChain defines an ordered
// list of approver levels (apchLevels: [{level, approverRole}]) a
// timesheet must clear before it is fully approved — extending the single
// -step approval state machine (#440) with a company-scoped routing
// policy. New table in the increment layer; no FK constraints.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'ApprovalChain', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    apchId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    apchCompId: { type: Sequelize.INTEGER, allowNull: false },
                    apchName: { type: Sequelize.TEXT, allowNull: false },
                    apchLevels: { type: Sequelize.JSONB, allowNull: false },
                    apchActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                    apchArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'ApprovalChain_compId_arch_idx', fields: ['apchCompId', 'apchArch'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
