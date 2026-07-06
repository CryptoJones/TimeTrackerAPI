// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Rate snapshot on time entries (rate review / audit item #10). teRateSnapshot
// freezes the hourly rate resolved when the entry was created, so editing a
// rate source afterwards can't retroactively re-price a not-yet-invoiced
// backlog. NULLABLE — an entry created before any rate source is resolvable
// stays null and falls through to live resolution. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            TABLE, 'teRateSnapshot',
            { type: Sequelize.DECIMAL(14, 2), allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(TABLE, 'teRateSnapshot');
    },
};
