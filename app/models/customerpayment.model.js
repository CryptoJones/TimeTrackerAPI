// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * CustomerPayment — a payment received from a Customer.
 *
 * Scope via cpayCustId → Customer.custCompId. Soft-deletes via cpayArch.
 */
module.exports = (sequelize, Sequelize) => {
    const CustomerPayment = sequelize.define('CustomerPayment', {
        cpayId: {
            field: 'cpayId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        cpayCustId: {
            field: 'cpayCustId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        cpayDescription: {
            field: 'cpayDescription',
            type: Sequelize.TEXT,
        },
        cpayDate: {
            field: 'cpayDate',
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        cpayAmount: {
            field: 'cpayAmount',
            // NUMERIC for exact cents; getter returns a Number so JSON
            // stays numeric (node-postgres yields NUMERIC as a string).
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
            get() {
                const v = this.getDataValue('cpayAmount');
                return v == null ? v : Number(v);
            },
        },
        // Optional link to the specific invoice this payment applies to.
        // Nullable so account-level (non-invoice) credits still work.
        cpayInvId: {
            field: 'cpayInvId',
            type: Sequelize.INTEGER,
        },
        cpayArch: {
            field: 'cpayArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'CustomerPayment',
        timestamps: true,
        defaultScope: { where: { cpayArch: false } }
    });

    return CustomerPayment;
};
