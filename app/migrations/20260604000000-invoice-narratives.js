// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Invoice branding & narratives (#423). compInvFooter is a per-company
// default footer/narrative printed on every invoice PDF; invNotes is a
// per-invoice note. Both TEXT, nullable. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const COMPANY = { tableName: 'Company', schema: SCHEMA };
const INVOICE = { tableName: 'Invoice', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(COMPANY, 'compInvFooter', { type: Sequelize.TEXT, allowNull: true }, { transaction: t });
            await queryInterface.addColumn(INVOICE, 'invNotes', { type: Sequelize.TEXT, allowNull: true }, { transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(INVOICE, 'invNotes', { transaction: t });
            await queryInterface.removeColumn(COMPANY, 'compInvFooter', { transaction: t });
        });
    },
};
