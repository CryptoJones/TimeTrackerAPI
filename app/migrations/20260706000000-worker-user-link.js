// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// User ↔ Worker link (#448 — separation of duties). Adds a nullable
// workerUserId column on Worker pointing at the User (sign-in account) that
// the worker corresponds to, so the approval action can block a signed-in
// user from approving their OWN logged time. Nullable + additive: no data
// change, no FK constraint (increment layer). setup/*.sql untouched.

'use strict';

const SCHEMA = 'dbo';
const TABLE = { tableName: 'Worker', schema: SCHEMA };

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            TABLE, 'workerUserId',
            { type: Sequelize.INTEGER, allowNull: true },
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeColumn(TABLE, 'workerUserId');
    },
};
