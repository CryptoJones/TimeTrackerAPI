// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * RecurringInvoice — a schedule that says "bill this customer every
 * <cadence>, next due <recinvNextRun>" (#425). Running it advances
 * recinvNextRun by the cadence and stamps recinvLastRun. Scope resolves
 * through recinvCustId → Customer.custCompId. Soft-deletes via recinvArch.
 */
module.exports = (sequelize, Sequelize) => {
    const RecurringInvoice = sequelize.define('RecurringInvoice', {
        recinvId: {
            field: 'recinvId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        recinvCustId: {
            field: 'recinvCustId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        recinvCadence: {
            field: 'recinvCadence',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        recinvNextRun: {
            field: 'recinvNextRun',
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        recinvLastRun: {
            field: 'recinvLastRun',
            type: Sequelize.DATEONLY,
        },
        recinvActive: {
            field: 'recinvActive',
            type: Sequelize.BOOLEAN,
            defaultValue: true,
        },
        recinvNote: {
            field: 'recinvNote',
            type: Sequelize.TEXT,
        },
        recinvArch: {
            field: 'recinvArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'RecurringInvoice',
        timestamps: true,
        defaultScope: { where: { recinvArch: false } }
    });

    return RecurringInvoice;
};
