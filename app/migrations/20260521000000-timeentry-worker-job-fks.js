// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Links a TimeEntry to the Worker who logged it (teWorkerId) and the
// Job it was worked against (teJobId). Both are nullable INTEGER: rows
// created before this migration have neither, and quick ad-hoc time may
// legitimately omit them. These columns are the schema foundation for
// the billing "money engine" (backlog #385 / #386): rate resolution
// reads the worker's default BillingType, and the time→invoice roll-up
// aggregates billable minutes per Job.
//
// Following the increment-layer convention (see
// 20260517000000-purchase-orders-and-archive-columns), the columns are
// added WITHOUT a physical FK constraint — matching the other
// migration-added link columns. The relationship is enforced at the
// application layer (controller validation + the Sequelize association
// wired in app/config/db.config.js). setup/*.sql is the frozen original
// v1.0 schema and is intentionally left untouched; fresh installs pick
// these columns up by running the migrations after the setup SQL.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                TABLE, 'teWorkerId',
                { type: Sequelize.INTEGER, allowNull: true },
                { transaction: t },
            );
            await queryInterface.addColumn(
                TABLE, 'teJobId',
                { type: Sequelize.INTEGER, allowNull: true },
                { transaction: t },
            );
            // Partial indexes for the "billable, unarchived time for a
            // worker / a job" access paths the reporting + roll-up
            // endpoints will use. Mirrors the WHERE "teArch" = FALSE
            // partial-index style of TimeEntry_customer_started_idx in
            // setup/TimeEntry.sql.
            await queryInterface.addIndex(TABLE, {
                name: 'TimeEntry_worker_idx',
                fields: ['teWorkerId'],
                where: { teArch: false },
                transaction: t,
            });
            await queryInterface.addIndex(TABLE, {
                name: 'TimeEntry_job_idx',
                fields: ['teJobId'],
                where: { teArch: false },
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(TABLE, 'TimeEntry_job_idx', { transaction: t });
            await queryInterface.removeIndex(TABLE, 'TimeEntry_worker_idx', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'teJobId', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'teWorkerId', { transaction: t });
        });
    },
};
