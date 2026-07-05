// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Sales tax (#420). Adds a per-company default tax rate (compTaxRate)
// and a per-invoice effective-rate column (invTaxRate). Rates are
// fractions stored as NUMERIC(6,4) — e.g. 0.0725 for 7.25%.
//
// compTaxRate is NOT NULL default 0 so existing companies simply charge
// no tax until configured. invTaxRate is nullable: invoices created
// before this migration (and un-rolled-up drafts) have no rate recorded.
// setup/*.sql (frozen original schema) untouched.

'use strict';

const SCHEMA = 'dbo';
const COMPANY = { tableName: 'Company', schema: SCHEMA };
const INVOICE = { tableName: 'Invoice', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                COMPANY, 'compTaxRate',
                { type: Sequelize.DECIMAL(6, 4), allowNull: false, defaultValue: 0 },
                { transaction: t },
            );
            await queryInterface.addColumn(
                INVOICE, 'invTaxRate',
                { type: Sequelize.DECIMAL(6, 4), allowNull: true },
                { transaction: t },
            );
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(INVOICE, 'invTaxRate', { transaction: t });
            await queryInterface.removeColumn(COMPANY, 'compTaxRate', { transaction: t });
        });
    },
};
