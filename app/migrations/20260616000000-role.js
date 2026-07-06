// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Role-based rates (#412). A Role (e.g. "Senior Consultant") carries a
// default hourly rate; a Worker is linked to a Role via workerRoleId.
// The role rate is a tier of rate resolution between the client rate and
// the worker's own default (see app/services/rate.js). New table +
// nullable Worker column in the increment layer; no FK constraints.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const ROLE = { tableName: 'Role', schema: SCHEMA };
const WORKER = { tableName: 'Worker', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.createTable(
                ROLE,
                {
                    roleId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
                    roleCompId: { type: Sequelize.INTEGER, allowNull: false },
                    roleName: { type: Sequelize.TEXT, allowNull: false },
                    roleRate: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
                    roleArch: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    createdAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                    updatedAt: { type: 'timestamp(3) without time zone', allowNull: false, defaultValue: Sequelize.fn('now') },
                },
                { transaction: t },
            );
            await queryInterface.addIndex(ROLE, {
                name: 'Role_compId_arch_idx',
                fields: ['roleCompId', 'roleArch'],
                transaction: t,
            });
            await queryInterface.addColumn(WORKER, 'workerRoleId', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            await queryInterface.removeColumn(WORKER, 'workerRoleId', { transaction: t });
            await queryInterface.dropTable(ROLE, { transaction: t });
        });
    },
};
