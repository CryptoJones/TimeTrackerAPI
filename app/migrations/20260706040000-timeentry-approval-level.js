// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Multi-level approval-chain enforcement (#443 / audit item #6). teApprovalLevel
// records how many of a company's approval-chain levels a timesheet has
// cleared; the entry becomes 'approved' only once it reaches the chain's level
// count. NOT NULL default 0 — Postgres backfills existing rows to 0 (unstarted)
// when the column is added. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            TABLE, 'teApprovalLevel',
            { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(TABLE, 'teApprovalLevel');
    },
};
