// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Adds the four PurchaseOrder/InventoryTransaction tables from the
// original SQL Server BACPAC that were omitted from
// `setup/TimeTracker.sql` (which only covered the tables the v1.0 API
// surface actually used). Also retrofits the missing `*Arch` columns
// onto two existing tables so the soft-delete pattern works uniformly
// across the full API:
//
//   - InventoryItem  → adds invitArch
//   - InvoiceJob     → adds injbArch
//
// New tables:
//   - InventoryTransactions
//   - PurchaseOrderHeaders
//   - PurchaseOrderLines
//   - PurchaseOrderVendors
//
// Column types come from the BACPAC schema (Microsoft.Data.Tools.Schema
// for SQL Server). Where the BACPAC declared a TEXT we use Postgres
// `TEXT`; bools map to BOOLEAN; doubles to DOUBLE PRECISION; dates to
// timestamp(3) without time zone (matching what the existing
// setup/TimeTracker.sql does for timestamp columns).

'use strict';

const SCHEMA = 'dbo';

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (t) => {
            // 1. Retrofit archive columns on existing tables.
            await queryInterface.addColumn(
                { tableName: 'InventoryItem', schema: SCHEMA },
                'invitArch',
                {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                { transaction: t },
            );
            await queryInterface.addColumn(
                { tableName: 'InvoiceJob', schema: SCHEMA },
                'injbArch',
                {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                { transaction: t },
            );

            // 2. InventoryTransactions — movement log for inventory.
            await queryInterface.createTable(
                { tableName: 'InventoryTransactions', schema: SCHEMA },
                {
                    invtId: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        primaryKey: true,
                        autoIncrement: true,
                    },
                    invtCompanyId:  { type: Sequelize.INTEGER, allowNull: false },
                    invtDirection:  { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                    invtArch:       { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                    invtInitId:     { type: Sequelize.INTEGER, allowNull: false },
                },
                { transaction: t },
            );

            // 3. PurchaseOrderVendors — vendors POs are issued to.
            //    Created before headers because the header FK-references it.
            await queryInterface.createTable(
                { tableName: 'PurchaseOrderVendors', schema: SCHEMA },
                {
                    povId: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        primaryKey: true,
                        autoIncrement: true,
                    },
                    povName:              { type: Sequelize.TEXT, allowNull: false },
                    povMailingAddress1:   { type: Sequelize.TEXT, allowNull: false },
                    povMailingAddress2:   { type: Sequelize.TEXT },
                    povMailingCity:       { type: Sequelize.TEXT, allowNull: false },
                    povMailingState:      { type: Sequelize.TEXT },
                    povMailingCountry:    { type: Sequelize.TEXT },
                    povMailingZip:        { type: Sequelize.TEXT },
                    povBillingAddress1:   { type: Sequelize.TEXT },
                    povBillingAddress2:   { type: Sequelize.TEXT },
                    povBillingCity:       { type: Sequelize.TEXT },
                    povBillingState:      { type: Sequelize.TEXT },
                    povBillingCountry:    { type: Sequelize.TEXT },
                    povBillingZip:        { type: Sequelize.TEXT },
                    povPhone:             { type: Sequelize.TEXT },
                    povEMail:             { type: Sequelize.TEXT },
                    povCompId:            { type: Sequelize.INTEGER, allowNull: false },
                    povArch:              { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                },
                { transaction: t },
            );

            // 4. PurchaseOrderHeaders — one row per PO.
            await queryInterface.createTable(
                { tableName: 'PurchaseOrderHeaders', schema: SCHEMA },
                {
                    pohId: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        primaryKey: true,
                        autoIncrement: true,
                    },
                    pohDate:       { type: 'timestamp(3) without time zone', allowNull: false },
                    pohReference:  { type: Sequelize.TEXT, allowNull: false },
                    pohTerms:      { type: Sequelize.TEXT, allowNull: false },
                    pohPovId:      { type: Sequelize.INTEGER, allowNull: false },
                    pohArch:       { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                },
                { transaction: t },
            );

            // 5. PurchaseOrderLines — line items per PO header.
            await queryInterface.createTable(
                { tableName: 'PurchaseOrderLines', schema: SCHEMA },
                {
                    polId: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        primaryKey: true,
                        autoIncrement: true,
                    },
                    polpoh:        { type: Sequelize.INTEGER, allowNull: false },
                    polItemDesc:   { type: Sequelize.TEXT, allowNull: false },
                    polQty:        { type: Sequelize.DOUBLE, allowNull: false },
                    polPrice:      { type: Sequelize.DOUBLE, allowNull: false },
                    polInvtId:     { type: Sequelize.INTEGER, allowNull: false },
                    polArch:       { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                },
                { transaction: t },
            );
        });
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface /*, Sequelize */) {
        await queryInterface.sequelize.transaction(async (t) => {
            // Drop tables in reverse dependency order. Lines reference
            // headers; headers reference vendors; transactions stand alone.
            await queryInterface.dropTable(
                { tableName: 'PurchaseOrderLines', schema: SCHEMA },
                { transaction: t },
            );
            await queryInterface.dropTable(
                { tableName: 'PurchaseOrderHeaders', schema: SCHEMA },
                { transaction: t },
            );
            await queryInterface.dropTable(
                { tableName: 'PurchaseOrderVendors', schema: SCHEMA },
                { transaction: t },
            );
            await queryInterface.dropTable(
                { tableName: 'InventoryTransactions', schema: SCHEMA },
                { transaction: t },
            );

            // Roll back the archive columns. Note: any rows that were
            // soft-deleted via these columns become "live" again after
            // rollback. There's no way to preserve their archived state
            // without keeping the column, so this is the documented
            // behavior. If that's a problem, archive the data before
            // running `migrate:undo`.
            await queryInterface.removeColumn(
                { tableName: 'InvoiceJob', schema: SCHEMA },
                'injbArch',
                { transaction: t },
            );
            await queryInterface.removeColumn(
                { tableName: 'InventoryItem', schema: SCHEMA },
                'invitArch',
                { transaction: t },
            );
        });
    },
};
