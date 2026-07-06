// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Per-link share-link revocation (#438 / audit item #4). A deny-list of
// revoked share-token `jti`s: the public invoice view rejects any token whose
// jti is listed, so a leaked link can be killed before its exp without
// rotating SHARE_SECRET (which would kill every link). New table in the
// increment layer; no FK constraints. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'RevokedShareLink', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    rslId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    rslJti: { type: Sequelize.TEXT, allowNull: false },
                    rslCompId: { type: Sequelize.INTEGER, allowNull: false },
                    rslExpiresAt: { type: Sequelize.DATE, allowNull: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'RevokedShareLink_jti_uidx', unique: true, fields: ['rslJti'], transaction: t });
            await queryInterface.addIndex(TABLE, { name: 'RevokedShareLink_expires_idx', fields: ['rslExpiresAt'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
