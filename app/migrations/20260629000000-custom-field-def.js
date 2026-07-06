// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Custom fields (#409). A CustomFieldDef declares a typed custom field
// (text/number/date/boolean) for a target entity type (customer / job /
// timeentry) within a company. Values are validated against these defs
// (app/services/custom-field.js); storing values on the target rows is a
// follow-up. New table in the increment layer; no FK constraints.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'CustomFieldDef', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                TABLE,
                {
                    cfdId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    cfdCompId: { type: Sequelize.INTEGER, allowNull: false },
                    cfdEntity: { type: Sequelize.TEXT, allowNull: false },
                    cfdName: { type: Sequelize.TEXT, allowNull: false },
                    cfdLabel: { type: Sequelize.TEXT, allowNull: true },
                    cfdType: { type: Sequelize.TEXT, allowNull: false },
                    cfdRequired: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    cfdArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(TABLE, { name: 'CustomFieldDef_scope_idx', fields: ['cfdCompId', 'cfdEntity', 'cfdArch'], transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable(TABLE);
    },
};
