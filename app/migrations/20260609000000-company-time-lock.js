// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Locked periods (#441). compTimeLockDate freezes time entries dated on
// or before it — no create / edit / delete in a closed period. Nullable
// DATEONLY (NULL = nothing locked). setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const COMPANY = { tableName: 'Company', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            COMPANY, 'compTimeLockDate',
            { type: Sequelize.DATEONLY, allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(COMPANY, 'compTimeLockDate');
    },
};
