// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Adds a per-entry billing-rate override to TimeEntry: teBillTypeId, a
// nullable INTEGER pointing at a BillingType. It is the top tier of the
// rate-resolution precedence (backlog #387): a specific entry can be
// billed at a chosen rate that overrides the worker's default
// BillingType. NULL (the common case) means "use the worker default".
//
// Same increment-layer convention as the worker/job columns
// (20260521000000): plain nullable column + partial index, no physical
// FK (enforced at the app layer), and setup/*.sql left untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                TABLE, 'teBillTypeId',
                { type: Sequelize.INTEGER, allowNull: true },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'TimeEntry_billtype_idx',
                fields: ['teBillTypeId'],
                where: { teArch: false },
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(TABLE, 'TimeEntry_billtype_idx', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'teBillTypeId', { transaction: t });
        });
    },
};
