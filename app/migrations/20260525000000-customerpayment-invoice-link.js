// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Adds cpayInvId to CustomerPayment: the Invoice a payment is allocated
// to (backlog #392). Until now a payment linked only to a Customer, so
// it could not reduce a specific invoice's balance. NULL means the
// payment sits "on account" against the customer (unallocated). This is
// the input the invoice balance/status derivation (#389) reads.
//
// Same increment-layer convention as the earlier link columns
// (20260521000000): plain nullable INTEGER + a partial index on the
// unarchived rows, no physical FK (enforced at the app layer), and
// setup/*.sql left untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'CustomerPayment', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                TABLE, 'cpayInvId',
                { type: Sequelize.INTEGER, allowNull: true },
                { transaction: t },
            );
            // The balance query is "payments allocated to this invoice".
            await queryInterface.addIndex(TABLE, {
                name: 'CustomerPayment_invoice_idx',
                fields: ['cpayInvId'],
                where: { cpayArch: false },
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(TABLE, 'CustomerPayment_invoice_idx', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'cpayInvId', { transaction: t });
        });
    },
};
