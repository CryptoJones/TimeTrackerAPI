// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Worker cost rate (#436): the internal cost per hour of a worker, used
// to compute project profitability / margin (revenue − cost). NUMERIC,
// nullable (NULL = no cost basis; the entry is excluded from cost).
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const WORKER = { tableName: 'Worker', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            WORKER, 'workerCostRate',
            { type: Sequelize.DECIMAL(14, 2), allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(WORKER, 'workerCostRate');
    },
};
