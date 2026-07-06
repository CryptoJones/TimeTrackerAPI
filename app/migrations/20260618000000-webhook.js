// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Outbound webhooks (#69). A Webhook registers a URL to POST to when a
// domain event fires (whkEvent, or '*' for all). whkSecret, if set, signs
// each delivery (HMAC-SHA256, X-Webhook-Signature). Company-scoped via
// whkCompId. New table in the increment layer; no FK constraints.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Webhook', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    whkId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    whkCompId: { type: Sequelize.INTEGER, allowNull: false },
                    whkUrl: { type: Sequelize.TEXT, allowNull: false },
                    whkEvent: { type: Sequelize.TEXT, allowNull: false },
                    whkSecret: { type: Sequelize.TEXT, allowNull: true },
                    whkActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                    whkArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'Webhook_compId_event_arch_idx', fields: ['whkCompId', 'whkEvent', 'whkArch'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
