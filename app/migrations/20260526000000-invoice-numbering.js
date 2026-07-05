// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Per-company invoice numbering (#390). Adds a configurable sequence to
// Company — a prefix, a zero-pad width, and the next counter — and an
// invNumber column on Invoice to hold the assigned human-facing number.
//
// The Company columns are NOT NULL with defaults so every existing
// company starts numbering at INV-0001 without a backfill step.
// invNumber is nullable: invoices created before this migration have no
// number. setup/*.sql (frozen original schema) is left untouched.

'use strict';

const SCHEMA = 'dbo';
const COMPANY = { tableName: 'Company', schema: SCHEMA };
const INVOICE = { tableName: 'Invoice', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                COMPANY, 'compInvPrefix',
                { type: Sequelize.TEXT, allowNull: false, defaultValue: 'INV-' },
                { transaction: t },
            );
            await queryInterface.addColumn(
                COMPANY, 'compInvPad',
                { type: Sequelize.INTEGER, allowNull: false, defaultValue: 4 },
                { transaction: t },
            );
            await queryInterface.addColumn(
                COMPANY, 'compInvNextSeq',
                { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
                { transaction: t },
            );
            await queryInterface.addColumn(
                INVOICE, 'invNumber',
                { type: Sequelize.TEXT, allowNull: true },
                { transaction: t },
            );
            await queryInterface.addIndex(INVOICE, {
                name: 'Invoice_number_idx',
                fields: ['invNumber'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(INVOICE, 'Invoice_number_idx', { transaction: t });
            await queryInterface.removeColumn(INVOICE, 'invNumber', { transaction: t });
            await queryInterface.removeColumn(COMPANY, 'compInvNextSeq', { transaction: t });
            await queryInterface.removeColumn(COMPANY, 'compInvPad', { transaction: t });
            await queryInterface.removeColumn(COMPANY, 'compInvPrefix', { transaction: t });
        });
    },
};
