// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Adds stored money columns to Invoice: invSubtotal, invTax, invTotal —
// each NUMERIC(14,2) (Sequelize DECIMAL). Until now an invoice carried
// no amount at all; the only money lived on InvoiceJob.injbAmount as a
// DOUBLE. These columns give the invoice an authoritative,
// float-drift-free subtotal / tax / grand total.
//
// They are NULLABLE on purpose: existing invoices have no computed
// total, and the columns are populated by the time→invoice roll-up
// (backlog #382) via app/services/money.js — NULL means "not yet
// totalled". Following the increment-layer convention, no CHECK/FK is
// added here and setup/*.sql (the frozen original schema) is untouched.
//
// NUMERIC(14,2) holds up to 12 integer digits — far beyond any realistic
// single invoice — and maps cleanly to the integer-cent math in
// money.js (14 significant digits, 2 fractional).

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Invoice', schema: SCHEMA };
const COLUMNS = ['invSubtotal', 'invTax', 'invTotal'];

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            for (const name of COLUMNS) {
                await queryInterface.addColumn(
                    TABLE, name,
                    { type: Sequelize.DECIMAL(14, 2), allowNull: true },
                    { transaction: t },
                );
            }
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            for (const name of [...COLUMNS].reverse()) {
                await queryInterface.removeColumn(TABLE, name, { transaction: t });
            }
        });
    },
};
