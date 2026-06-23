// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Invoicing engine, step 3 (auto-bill from job). Adds the link that
// marks a time entry as already billed onto a specific invoice line:
//   - TimeEntry.teInvoiceJobId  FK -> InvoiceJob. NULL = un-invoiced
//     (available to bill). Set when POST /v1/invoice/from-job/:jobId
//     rolls the entry's billable time into an InvoiceJob line, so the
//     same hours can't be billed twice.
//
// Additive + nullable: existing rows stay un-invoiced (NULL). Down drops
// the column.

'use strict';

const SCHEMA = 'dbo';

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
            ALTER TABLE "${SCHEMA}"."TimeEntry"
                    ADD COLUMN IF NOT EXISTS "teInvoiceJobId" INTEGER
        `);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`
            ALTER TABLE "${SCHEMA}"."TimeEntry"
                    DROP COLUMN IF EXISTS "teInvoiceJobId"
        `);
    },
};
