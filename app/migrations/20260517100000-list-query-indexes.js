// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Adds composite indexes for the dominant list-query patterns
// across the entity set. Every `bycompany/:id` / `bycustomer/:id` /
// `byvendor/:id` / `byheader/:id` / `byjob/:id` / `byinvoice/:id`
// endpoint runs a `WHERE <parent>Id = ? AND <arch> = false` query.
// Without these indexes that's a sequential scan against a growing
// table.
//
// TimeEntry already has `TimeEntry_company_started_idx` +
// `TimeEntry_customer_started_idx` (added in setup/TimeEntry.sql).
// This migration adds the same pattern to the rest:
//
//   Direct-compId scoping:
//     Customer            (custCompId, custArch)
//     Worker              (workerCompId, workerArch)
//     BillingType         (btCompId, btArch)
//     InventoryItem       (invitCompId, invitArch)
//     PurchaseOrderVendor (povCompId, povArch)
//     InventoryTransaction (invtCompanyId, invtArch)
//
//   Customer-scoped:
//     Job                 (jobCustId, jobArch)
//     Invoice             (invCustId, invArch)
//     CustomerPayment     (cpayCustId, cpayArch)
//
//   Header/vendor/job-scoped:
//     PurchaseOrderHeader (pohPovId, pohArch)
//     PurchaseOrderLine   (polpoh, polArch)
//     InvoiceJob          (injbInvId, injbArch) — list-by-invoice
//     ProductEntry        (pentJobId, penArch)  — note "penArch" typo in schema
//
// All indexes are `IF NOT EXISTS` so the migration is idempotent
// against installs that may have added some of these by hand.

'use strict';

const SCHEMA = 'dbo';

// Each entry: [tableName, indexName, [columns...]]
const INDEXES = [
    ['Customer',             'Customer_compId_arch_idx',             ['custCompId', 'custArch']],
    ['Worker',               'Worker_compId_arch_idx',               ['workerCompId', 'workerArch']],
    ['BillingType',          'BillingType_compId_arch_idx',          ['btCompId', 'btArch']],
    ['InventoryItem',        'InventoryItem_compId_arch_idx',        ['invitCompId', 'invitArch']],
    ['PurchaseOrderVendors', 'POVendors_compId_arch_idx',            ['povCompId', 'povArch']],
    ['InventoryTransactions','InventoryTransactions_compId_arch_idx',['invtCompanyId', 'invtArch']],
    ['Job',                  'Job_custId_arch_idx',                  ['jobCustId', 'jobArch']],
    ['Invoice',              'Invoice_custId_arch_idx',              ['invCustId', 'invArch']],
    ['CustomerPayment',      'CustomerPayment_custId_arch_idx',      ['cpayCustId', 'cpayArch']],
    ['PurchaseOrderHeaders', 'POHeaders_povId_arch_idx',             ['pohPovId', 'pohArch']],
    ['PurchaseOrderLines',   'POLines_pohId_arch_idx',               ['polpoh', 'polArch']],
    ['InvoiceJob',           'InvoiceJob_invId_arch_idx',            ['injbInvId', 'injbArch']],
    ['ProductEntry',         'ProductEntry_jobId_arch_idx',          ['pentJobId', 'penArch']],
];

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface) {
        for (const [tableName, indexName, fields] of INDEXES) {
            // queryInterface.addIndex doesn't have an IF NOT EXISTS
            // option in Sequelize 6, so we use a raw query.
            const cols = fields.map((c) => `"${c}"`).join(', ');
            await queryInterface.sequelize.query(
                `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${SCHEMA}"."${tableName}" (${cols});`,
            );
        }
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface) {
        // Reverse order, also IF EXISTS so a partial-failed up doesn't
        // wedge the rollback.
        for (let i = INDEXES.length - 1; i >= 0; i -= 1) {
            const [, indexName] = INDEXES[i];
            await queryInterface.sequelize.query(
                `DROP INDEX IF EXISTS "${SCHEMA}"."${indexName}";`,
            );
        }
    },
};
