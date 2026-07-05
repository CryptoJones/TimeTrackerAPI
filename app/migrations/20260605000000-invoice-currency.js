// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Invoice currency (#427). compCurrency is a per-company default 3-letter
// ISO-4217 code (NOT NULL default 'USD'); invCurrency records the code an
// invoice was raised in (nullable — the roll-up stamps it from the
// company default). No FX conversion — this records/displays currency.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const COMPANY = { tableName: 'Company', schema: SCHEMA };
const INVOICE = { tableName: 'Invoice', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                COMPANY, 'compCurrency',
                { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'USD' },
                { transaction: t },
            );
            await queryInterface.addColumn(
                INVOICE, 'invCurrency',
                { type: Sequelize.STRING(3), allowNull: true },
                { transaction: t },
            );
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(INVOICE, 'invCurrency', { transaction: t });
            await queryInterface.removeColumn(COMPANY, 'compCurrency', { transaction: t });
        });
    },
};
