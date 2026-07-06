// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Timesheet approval workflow (#440). teApprovalStatus tracks a time
// entry through open → submitted → approved / rejected. NOT NULL default
// 'open' — Postgres backfills existing rows to 'open' when the column is
// added. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            TABLE, 'teApprovalStatus',
            { type: Sequelize.TEXT, allowNull: false, defaultValue: 'open' },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(TABLE, 'teApprovalStatus');
    },
};
