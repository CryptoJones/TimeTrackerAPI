// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Scheduled report delivery (#57). A ReportSchedule emails a report
// (rptschReport) to rptschTo on a cadence; running it advances
// rptschNextRun and stamps rptschLastRun. Company-scoped via rptschCompId.
// New table in the increment layer; no FK constraints. setup/*.sql
// untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'ReportSchedule', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    rptschId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    rptschCompId: { type: Sequelize.INTEGER, allowNull: false },
                    rptschReport: { type: Sequelize.TEXT, allowNull: false },
                    rptschTo: { type: Sequelize.TEXT, allowNull: false },
                    rptschCadence: { type: Sequelize.TEXT, allowNull: false },
                    rptschNextRun: { type: Sequelize.DATEONLY, allowNull: false },
                    rptschLastRun: { type: Sequelize.DATEONLY, allowNull: true },
                    rptschActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                    rptschArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'ReportSchedule_compId_arch_idx', fields: ['rptschCompId', 'rptschArch'], transaction: t });
            await queryInterface.addIndex(TABLE, { name: 'ReportSchedule_due_idx', fields: ['rptschNextRun', 'rptschActive'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
