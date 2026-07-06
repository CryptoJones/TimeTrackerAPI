// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Password reset (#446). userResetTokenHash holds the SHA-256 of a
// one-time reset token (never the raw token); userResetExpires is when it
// lapses. Both NULL when no reset is pending. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const USER = { tableName: 'User', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(USER, 'userResetTokenHash', { type: Sequelize.TEXT, allowNull: true }, { transaction: t });
            await queryInterface.addColumn(USER, 'userResetExpires', { type: Sequelize.DATE, allowNull: true }, { transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(USER, 'userResetExpires', { transaction: t });
            await queryInterface.removeColumn(USER, 'userResetTokenHash', { transaction: t });
        });
    },
};
