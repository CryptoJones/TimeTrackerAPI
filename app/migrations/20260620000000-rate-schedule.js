// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Rate effective-dating (#414). A RateSchedule is a named rate that
// applies over a date range (rschEffectiveFrom .. rschEffectiveTo, the
// latter open-ended when NULL). Company-scoped via rschCompId. This lands
// the model + a queryable resolver (see rate-schedule.js); wiring
// date-aware selection into rate.js's live billing resolution is a
// follow-up. New table in the increment layer; no FK constraints.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'RateSchedule', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    rschId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    rschCompId: { type: Sequelize.INTEGER, allowNull: false },
                    rschName: { type: Sequelize.TEXT, allowNull: false },
                    rschRate: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
                    rschEffectiveFrom: { type: Sequelize.DATEONLY, allowNull: false },
                    rschEffectiveTo: { type: Sequelize.DATEONLY, allowNull: true },
                    rschArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'RateSchedule_compId_from_arch_idx',
                fields: ['rschCompId', 'rschEffectiveFrom', 'rschArch'],
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
