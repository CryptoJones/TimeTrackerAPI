// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Worker weekly target hours (#400). workerTargetMinsPerWeek is a
// capacity target in minutes/week; the targets report compares actual
// logged time against it over a date range. Nullable INTEGER (NULL = no
// target). setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const WORKER = { tableName: 'Worker', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            WORKER, 'workerTargetMinsPerWeek',
            { type: Sequelize.INTEGER, allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(WORKER, 'workerTargetMinsPerWeek');
    },
};
