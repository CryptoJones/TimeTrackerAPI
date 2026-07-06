// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Milestone billing (#428): phaseBilledInvId records the invoice a phase
// was billed on, so a phase can't be double-billed. NULL until billed.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const PHASE = { tableName: 'Phase', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            PHASE, 'phaseBilledInvId',
            { type: Sequelize.INTEGER, allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(PHASE, 'phaseBilledInvId');
    },
};
