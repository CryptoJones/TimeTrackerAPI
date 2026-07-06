// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Roles & permissions / RBAC (#448). userRole assigns each user (#444) an
// RBAC role (owner/admin/manager/member/viewer); the permission matrix
// lives in app/services/rbac.js. Existing rows default to 'member'.
// setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const USER = { tableName: 'User', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(USER, 'userRole', {
            type: Sequelize.TEXT,
            allowNull: false,
            defaultValue: 'member',
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(USER, 'userRole');
    },
};
