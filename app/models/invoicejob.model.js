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
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        injbAmount: {
            field: 'injbAmount',
            // NUMERIC(14,2) with a Number getter (pg NUMERIC→string), matching
            // every other money column — exact-decimal at rest.
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
            get() {
                const v = this.getDataValue('injbAmount');
                return v == null ? null : Number(v);
            },
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
