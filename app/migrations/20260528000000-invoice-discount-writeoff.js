// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Invoice discounts & write-offs (#421). invDiscount reduces the
// subtotal before tax at roll-up time; invWriteOff records an amount
// written off (uncollectible) that reduces the outstanding balance in
// the payment-driven status derivation. Both NUMERIC(14,2), nullable
// (NULL = none). setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const INVOICE = { tableName: 'Invoice', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                INVOICE, 'invDiscount',
                { type: Sequelize.DECIMAL(14, 2), allowNull: true },
                { transaction: t },
            );
            await queryInterface.addColumn(
                INVOICE, 'invWriteOff',
                { type: Sequelize.DECIMAL(14, 2), allowNull: true },
                { transaction: t },
            );
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(INVOICE, 'invWriteOff', { transaction: t });
            await queryInterface.removeColumn(INVOICE, 'invDiscount', { transaction: t });
        });
    },
};
