// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Idempotency pre-handler claim (audit item #2). To close the concurrent
// double-execution window, the middleware now inserts a PENDING claim row
// BEFORE running the handler (and completes/releases it after). A pending row
// has no response yet, so ikResponseStatus / ikResponseBody must be NULLABLE.
// Additive + reversible; setup/*.sql untouched.

'use strict';

const TABLE = '"dbo"."IdempotencyKey"';

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface) {
        await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} ALTER COLUMN "ikResponseStatus" DROP NOT NULL;`);
        await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} ALTER COLUMN "ikResponseBody" DROP NOT NULL;`);
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface) {
        // Drop any still-pending rows before restoring NOT NULL.
        await queryInterface.sequelize.query(`DELETE FROM ${TABLE} WHERE "ikResponseStatus" IS NULL OR "ikResponseBody" IS NULL;`);
        await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} ALTER COLUMN "ikResponseStatus" SET NOT NULL;`);
        await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} ALTER COLUMN "ikResponseBody" SET NOT NULL;`);
    },
};
