// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Opt-in approval billing gate (audit item #7). compRequireApproval, when
// true, makes the invoice rollup bill ONLY approved time (non-approved
// billable time is reported back as skipped). NOT NULL default false —
// existing companies keep the current behavior (approval is a workflow, not a
// billing gate). setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Company', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            TABLE, 'compRequireApproval',
            { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(TABLE, 'compRequireApproval');
    },
};
