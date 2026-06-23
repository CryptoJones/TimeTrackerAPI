// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Invoicing engine, step 4 (carry-forward). A "balance brought forward"
// line is not tied to a job, so InvoiceJob.injbJobId must allow NULL.
// Loosening a NOT NULL is safe for existing rows (they all have a value).
//
// Down re-applies NOT NULL. NOTE: this fails if any job-less
// (carry-forward) lines exist — resolve those manually first. Down is a
// best-effort convenience for a one-way schema loosening.

'use strict';

const SCHEMA = 'dbo';

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
            ALTER TABLE "${SCHEMA}"."InvoiceJob"
                    ALTER COLUMN "injbJobId" DROP NOT NULL
        `);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`
            ALTER TABLE "${SCHEMA}"."InvoiceJob"
                    ALTER COLUMN "injbJobId" SET NOT NULL
        `);
    },
};
