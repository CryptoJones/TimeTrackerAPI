// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Recurring invoice schedules (#425). A RecurringInvoice records WHO to
// bill (recinvCustId) on what CADENCE, and WHEN it next falls due
// (recinvNextRun). Running it advances the schedule by its cadence and
// stamps recinvLastRun. Scoped to a company through recinvCustId →
// Customer. New table in the increment layer; no FK constraints.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'RecurringInvoice', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    recinvId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    recinvCustId: { type: Sequelize.INTEGER, allowNull: false },
                    recinvCadence: { type: Sequelize.TEXT, allowNull: false },
                    recinvNextRun: { type: Sequelize.DATEONLY, allowNull: false },
                    recinvLastRun: { type: Sequelize.DATEONLY, allowNull: true },
                    recinvActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                    recinvNote: { type: Sequelize.TEXT, allowNull: true },
                    recinvArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'RecurringInvoice_custId_arch_idx', fields: ['recinvCustId', 'recinvArch'], transaction: t });
            await queryInterface.addIndex(TABLE, { name: 'RecurringInvoice_due_idx', fields: ['recinvNextRun', 'recinvActive'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
