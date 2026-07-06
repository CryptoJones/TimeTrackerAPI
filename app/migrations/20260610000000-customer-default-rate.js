// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Client rate card (#413). custDefaultRate is a client's negotiated
// hourly rate — the "client" tier of rate resolution, between a
// per-project flat rate and the worker's default (see app/services/rate.js).
// NUMERIC(14,2), nullable (NULL = no client rate; fall through).
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const CUSTOMER = { tableName: 'Customer', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            CUSTOMER, 'custDefaultRate',
            { type: Sequelize.DECIMAL(14, 2), allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(CUSTOMER, 'custDefaultRate');
    },
};
