// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Receipt attachment/upload (#419). A Receipt stores a file (rcptData,
// bytea) attached to an Expense (#416). Company-scoped via rcptCompId
// (denormalized from the expense) for cheap scoping. Bytes live in
// Postgres so the API is self-contained; an external object store (S3)
// can drop in behind the controller later. New table in the increment
// layer; no FK constraints. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Receipt', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    rcptId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    rcptExpId: { type: Sequelize.INTEGER, allowNull: false },
                    rcptCompId: { type: Sequelize.INTEGER, allowNull: false },
                    rcptFilename: { type: Sequelize.TEXT, allowNull: false },
                    rcptContentType: { type: Sequelize.TEXT, allowNull: false },
                    rcptSize: { type: Sequelize.INTEGER, allowNull: false },
                    rcptData: { type: Sequelize.BLOB, allowNull: false },
                    rcptArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'Receipt_expId_arch_idx', fields: ['rcptExpId', 'rcptArch'], transaction: t });
            await queryInterface.addIndex(TABLE, { name: 'Receipt_compId_arch_idx', fields: ['rcptCompId', 'rcptArch'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
