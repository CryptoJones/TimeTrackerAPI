// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// DCAA-grade audit trail (#462). Extends the request-level audit log
// (#460) with the fields a defense-contract-grade trail needs: which
// record was touched (alogEntityId), the before/after field changes
// (alogChanges), and a justification (alogReason). All nullable — the
// middleware keeps writing request-level rows; the richer detail is
// optional and additive. setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'AuditLog', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(TABLE, 'alogEntityId', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });
            await queryInterface.addColumn(TABLE, 'alogChanges', { type: Sequelize.JSONB, allowNull: true }, { transaction: t });
            await queryInterface.addColumn(TABLE, 'alogReason', { type: Sequelize.TEXT, allowNull: true }, { transaction: t });
            await queryInterface.addIndex(TABLE, { name: 'AuditLog_entity_lookup_idx', fields: ['alogCompId', 'alogEntity', 'alogEntityId'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(TABLE, 'AuditLog_entity_lookup_idx', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'alogReason', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'alogChanges', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'alogEntityId', { transaction: t });
        });
    },
};
