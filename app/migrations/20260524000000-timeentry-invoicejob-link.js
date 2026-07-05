// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Adds teInvJobId to TimeEntry: the InvoiceJob line an entry was rolled
// into by the time→invoice roll-up (backlog #382). It doubles as the
// "invoiced" marker — NULL means the entry's billable time has not yet
// been billed, so the roll-up only ever picks up NULL rows and can never
// double-bill the same minutes.
//
// Same increment-layer convention as the earlier link columns
// (20260521000000): plain nullable INTEGER + a partial index on the
// unbilled hot path, no physical FK (enforced at the app layer), and
// setup/*.sql left untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                TABLE, 'teInvJobId',
                { type: Sequelize.INTEGER, allowNull: true },
                { transaction: t },
            );
            // The roll-up query is "billable, unarchived, NOT-yet-invoiced
            // time for a customer". Index the uninvoiced rows so that
            // scan stays cheap as the table grows.
            await queryInterface.addIndex(TABLE, {
                name: 'TimeEntry_uninvoiced_idx',
                fields: ['teCustId'],
                where: { teArch: false, teInvJobId: null },
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(TABLE, 'TimeEntry_uninvoiced_idx', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'teInvJobId', { transaction: t });
        });
    },
};
