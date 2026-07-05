// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Per-project flat rate (#410). jobFlatRate is an hourly rate applied to
// all time booked against the job — the middle tier of rate resolution,
// between a per-entry BillingType override and the worker's default rate
// (see app/services/rate.js). NUMERIC(14,2), nullable (NULL = no project
// rate; fall through). setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const JOB = { tableName: 'Job', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            JOB, 'jobFlatRate',
            { type: Sequelize.DECIMAL(14, 2), allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(JOB, 'jobFlatRate');
    },
};
