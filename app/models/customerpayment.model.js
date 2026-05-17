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
            type: Sequelize.DOUBLE,
            allowNull: false,
        },
        cpayArch: {
            field: 'cpayArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'CustomerPayment',
        timestamps: false,
    });

    return CustomerPayment;
};
