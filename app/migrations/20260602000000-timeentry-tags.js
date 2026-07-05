// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Tags on time entries (#406). teTags is a JSONB array of freeform label
// strings, nullable (NULL = no tags; the model getter normalizes to []).
// A GIN index backs containment queries for the ?tag= filter. setup/*.sql
// (the frozen original TimeEntry DDL) untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'TimeEntry', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.addColumn(
                TABLE, 'teTags',
                { type: Sequelize.JSONB, allowNull: true },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, {
                name: 'TimeEntry_tags_gin',
                fields: ['teTags'],
                using: 'gin',
                transaction: t,
            });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeIndex(TABLE, 'TimeEntry_tags_gin', { transaction: t });
            await queryInterface.removeColumn(TABLE, 'teTags', { transaction: t });
        });
    },
};
