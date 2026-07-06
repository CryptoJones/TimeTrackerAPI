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
        cpayInvId: {
            field: 'cpayInvId',
            // Nullable: the Invoice this payment is allocated to. NULL =
            // on-account (unallocated). Drives invoice balance/status.
            type: Sequelize.INTEGER,
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
            // NUMERIC(14,2) with a Number getter (pg NUMERIC→string), matching
            // every other money column — exact-decimal at rest.
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
            get() {
                const v = this.getDataValue('cpayAmount');
                return v == null ? null : Number(v);
            },
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
