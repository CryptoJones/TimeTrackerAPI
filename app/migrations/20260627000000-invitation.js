// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Teammate invitations (#458). An Invitation records a pending invite to
// join a company workspace with a chosen RBAC role (#448); accepting it
// (with the emailed token) provisions a User (#444). Only the token's
// SHA-256 is stored. New table in the increment layer; no FK constraints.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Invitation', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    invtId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    invtCompId: { type: Sequelize.INTEGER, allowNull: false },
                    invtEmail: { type: Sequelize.TEXT, allowNull: false },
                    invtRole: { type: Sequelize.TEXT, allowNull: false },
                    invtTokenHash: { type: Sequelize.TEXT, allowNull: false },
                    invtExpires: { type: Sequelize.DATE, allowNull: false },
                    invtAcceptedAt: { type: Sequelize.DATE, allowNull: true },
                    invtArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'Invitation_compId_arch_idx', fields: ['invtCompId', 'invtArch'], transaction: t });
            await queryInterface.addIndex(TABLE, { name: 'Invitation_tokenHash_idx', fields: ['invtTokenHash'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
