// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// User accounts (#444). A User is a person who signs in to a company
// (userCompId). userPasswordHash stores a scrypt digest (see
// app/services/password.js) — never a plaintext password. This is the
// foundation for login (#445) and password reset (#446); it does NOT
// change the existing API-key auth. New table in the increment layer; no
// FK constraints. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'User', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    userId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    userCompId: { type: Sequelize.INTEGER, allowNull: false },
                    userEmail: { type: Sequelize.TEXT, allowNull: false },
                    userName: { type: Sequelize.TEXT, allowNull: true },
                    userPasswordHash: { type: Sequelize.TEXT, allowNull: false },
                    userArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'User_compId_arch_idx', fields: ['userCompId', 'userArch'], transaction: t });
            await queryInterface.addIndex(TABLE, { name: 'User_email_idx', fields: ['userEmail'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
