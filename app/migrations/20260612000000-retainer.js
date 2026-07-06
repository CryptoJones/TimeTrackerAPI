// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Retainer entity (#426): a client prepayment that invoices/work draw
// down. retAmount is the original deposit; retBalance is what's left.
// Scoped to a company through retCustId → Customer. A new table in the
// increment layer; no FK constraints. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Retainer', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    retId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    retCustId: { type: Sequelize.INTEGER, allowNull: false },
                    retAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
                    retBalance: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
                    retNote: { type: Sequelize.TEXT, allowNull: true },
                    retArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'Retainer_custId_arch_idx',
                fields: ['retCustId', 'retArch'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
