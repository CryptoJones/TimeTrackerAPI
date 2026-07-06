// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Per-task rate (#411). Task.taskRate is a flat hourly rate for a task;
// TimeEntry.teTaskId links an entry to a task under its job. The task
// rate is the most-specific tier of rate resolution after a per-entry
// override (see app/services/rate.js). Both nullable. setup/*.sql
// untouched.

'use strict';

const SCHEMA = 'dbo';
const TASK = { tableName: 'Task', schema: SCHEMA };
const TIMEENTRY = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(TASK, 'taskRate', { type: Sequelize.DECIMAL(14, 2), allowNull: true }, { transaction: t });
            await queryInterface.addColumn(TIMEENTRY, 'teTaskId', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(TIMEENTRY, 'teTaskId', { transaction: t });
            await queryInterface.removeColumn(TASK, 'taskRate', { transaction: t });
        });
    },
};
