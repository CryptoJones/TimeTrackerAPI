// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * InvoiceJob — a line item on an Invoice referencing a Job.
 *
 * Scope via injbJobId → Job → Customer → custCompId (see
 * auth.getCompanyIdByJobId). Soft-deletes via injbArch (column added
 * in the same migration that filled in the rest of the missing
 * archive columns and the four PurchaseOrder/InventoryTransaction
 * tables).
 */
module.exports = (sequelize, Sequelize) => {
    const InvoiceJob = sequelize.define('InvoiceJob', {
        injbId: {
            field: 'injbId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        injbInvId: {
            field: 'injbInvId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        injbJobId: {
            field: 'injbJobId',
            // Nullable: a "balance brought forward" line (carry-forward)
            // is not tied to a job. Normal job lines still set it (the
            // create/bulk schema requires it).
            type: Sequelize.INTEGER,
        },
        injbAmount: {
            field: 'injbAmount',
            type: Sequelize.DOUBLE,
            allowNull: false,
        },
        injbArch: {
            field: 'injbArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'InvoiceJob',
        timestamps: true,
        defaultScope: { where: { injbArch: false } }
    });

    return InvoiceJob;
};
