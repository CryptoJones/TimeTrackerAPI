// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Audit log (#460): an append-only trail of successful mutations — who
// (actor + company), what (method + path + entity), when. Written
// fire-and-forget by the audit middleware after each mutating request.
// A new table in the increment layer; no FK constraints. setup/*.sql
// untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'AuditLog', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    alogId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    alogCompId: { type: Sequelize.INTEGER, allowNull: true },
                    alogActor: { type: Sequelize.TEXT, allowNull: false },
                    alogMethod: { type: Sequelize.TEXT, allowNull: false },
                    alogPath: { type: Sequelize.TEXT, allowNull: false },
                    alogEntity: { type: Sequelize.TEXT, allowNull: true },
                    alogStatus: { type: Sequelize.INTEGER, allowNull: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'AuditLog_compId_id_idx',
                fields: ['alogCompId', 'alogId'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
