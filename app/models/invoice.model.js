// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Invoice — a bill issued to a Customer.
 *
 * Scope via invCustId → Customer.custCompId. Soft-deletes via invArch.
 * invPaid is a separate flag from invArch — paid invoices are still
 * read-only via the API, never auto-archived.
 */
module.exports = (sequelize, Sequelize) => {
    const Invoice = sequelize.define('Invoice', {
        invId: {
            field: 'invId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        invDate: {
            field: 'invDate',
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        invDueDate: {
            field: 'invDueDate',
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        invPaid: {
            field: 'invPaid',
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        invArch: {
            field: 'invArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        invCustId: {
            field: 'invCustId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
    }, {
        tableName: 'Invoice',
        timestamps: false,
        defaultScope: { where: { invArch: false } }
    });

    return Invoice;
};
