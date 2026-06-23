// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Invoicing & Payments engine, step 1 (see PRODUCT-BACKLOG.md Appendix A).
// Additive, nullable/defaulted columns so existing rows are untouched:
//   - CustomerPayment.cpayInvId       FK -> Invoice. Lets a payment apply
//                                     to a specific invoice (today payments
//                                     attach only to a customer), which is
//                                     the keystone for per-invoice balance
//                                     + partial-payment tracking. Nullable
//                                     so account-level credits still work.
//   - Invoice.invStatus               draft/sent/partial/paid/void. Status
//                                     source of truth (the boolean invPaid
//                                     can't represent 'partial'). Defaults
//                                     'draft'; existing paid invoices are
//                                     backfilled to 'paid' from invPaid.
//   - Invoice.invBalanceForwardFrom   FK -> Invoice, linking a
//                                     balance-carried invoice to its
//                                     predecessor (carry-forward, step 4).
//
// Down: drop the three columns. Safe — nothing else references them yet.

'use strict';

const SCHEMA = 'dbo';

module.exports = {
    async up(queryInterface) {
        const sequelize = queryInterface.sequelize;
        await sequelize.query(`
            ALTER TABLE "${SCHEMA}"."CustomerPayment"
                    ADD COLUMN IF NOT EXISTS "cpayInvId" INTEGER
        `);
        await sequelize.query(`
            ALTER TABLE "${SCHEMA}"."Invoice"
                    ADD COLUMN IF NOT EXISTS "invStatus" VARCHAR(16) NOT NULL DEFAULT 'draft',
                    ADD COLUMN IF NOT EXISTS "invBalanceForwardFrom" INTEGER
        `);
        // Backfill: existing invoices flagged paid become 'paid'.
        await sequelize.query(`
            UPDATE "${SCHEMA}"."Invoice"
                    SET "invStatus" = 'paid'
                    WHERE "invPaid" = true AND "invStatus" = 'draft'
        `);
    },

    async down(queryInterface) {
        const sequelize = queryInterface.sequelize;
        await sequelize.query(`
            ALTER TABLE "${SCHEMA}"."Invoice"
                    DROP COLUMN IF EXISTS "invBalanceForwardFrom",
                    DROP COLUMN IF EXISTS "invStatus"
        `);
        await sequelize.query(`
            ALTER TABLE "${SCHEMA}"."CustomerPayment"
                    DROP COLUMN IF EXISTS "cpayInvId"
        `);
    },
};
