// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Add `createdAt` / `updatedAt` (TIMESTAMPTZ NOT NULL DEFAULT now())
// to every domain table so Sequelize models can flip
// `timestamps: false` → `timestamps: true`.
//
// Why P4-K:
//   - Auditability: every row carries its creation + last-modification
//     time without each controller having to maintain it by hand.
//   - Sync clients: third-party integrations get a reliable
//     "what's changed since T" boundary for delta-pull workflows.
//   - Observability: SQL ad-hoc analysis on "new customers per day"
//     etc. trivially works off `createdAt` rather than a row-counter.
//
// IdempotencyKey is intentionally NOT in this list — it already
// manages its own ikCreatedAt/ikExpiresAt and a parallel
// createdAt/updatedAt pair would be redundant + confusing.
//
// Backfill strategy:
//   Existing rows have no recorded history, so we backfill both
//   columns to now() at migration-apply time. Operators with the
//   original SQL Server timestamps (Atbash legacy) can patch
//   real values post-migration via a one-off UPDATE.
//
// Down: simply DROP the two columns from each table. Safe — no
// FKs reference these columns.

'use strict';

const TABLES = [
    'ApiKey',
    'ApiMaster',
    'BillingType',
    'Company',
    'Customer',
    'CustomerPayment',
    'InventoryItem',
    'InventoryTransactions',
    'Invoice',
    'InvoiceJob',
    'Job',
    'ProductEntry',
    'PurchaseOrderHeaders',
    'PurchaseOrderLines',
    'PurchaseOrderVendors',
    'TimeEntry',
    'VersionInfo',
    'Worker',
];

module.exports = {
    async up(queryInterface, Sequelize) {
        const SCHEMA = 'dbo';
        const sequelize = queryInterface.sequelize;
        for (const table of TABLES) {
            await sequelize.query(`
                ALTER TABLE "${SCHEMA}"."${table}"
                    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
            `);
        }
    },

    async down(queryInterface, Sequelize) {
        const SCHEMA = 'dbo';
        const sequelize = queryInterface.sequelize;
        for (const table of TABLES) {
            await sequelize.query(`
                ALTER TABLE "${SCHEMA}"."${table}"
                    DROP COLUMN IF EXISTS "updatedAt",
                    DROP COLUMN IF EXISTS "createdAt"
            `);
        }
    },
};
