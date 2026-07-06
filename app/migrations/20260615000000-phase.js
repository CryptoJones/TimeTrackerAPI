// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Project phase / milestone entity (#408): a date-bounded, budgeted
// billing stage of a Job. Distinct from a Task (an activity) — a Phase
// carries a start/end and a budget amount, the unit of milestone billing.
// Scoped to a company through phaseJobId → Job → Customer. A new table in
// the increment layer; no FK constraints. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Phase', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    phaseId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    phaseJobId: { type: Sequelize.INTEGER, allowNull: false },
                    phaseName: { type: Sequelize.TEXT, allowNull: false },
                    phaseStartDate: { type: Sequelize.DATEONLY, allowNull: true },
                    phaseEndDate: { type: Sequelize.DATEONLY, allowNull: true },
                    phaseBudgetAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
                    phaseArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'Phase_jobId_arch_idx',
                fields: ['phaseJobId', 'phaseArch'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
