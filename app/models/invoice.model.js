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
        // Stored money (NUMERIC(14,2), added in migration 20260522).
        // pg returns NUMERIC as a string; the getters hand the API a
        // Number — or null when the invoice hasn't been totalled yet.
        // Populated by the time→invoice roll-up (#382) via
        // app/services/money.js so the arithmetic never drifts.
        invSubtotal: {
            field: 'invSubtotal',
            type: Sequelize.DECIMAL(14, 2),
            get() {
                const v = this.getDataValue('invSubtotal');
                return v == null ? null : Number(v);
            },
        },
        invTax: {
            field: 'invTax',
            type: Sequelize.DECIMAL(14, 2),
            get() {
                const v = this.getDataValue('invTax');
                return v == null ? null : Number(v);
            },
        },
        invTotal: {
            field: 'invTotal',
            type: Sequelize.DECIMAL(14, 2),
            get() {
                const v = this.getDataValue('invTotal');
                return v == null ? null : Number(v);
            },
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
        invNumber: {
            field: 'invNumber',
            // Human-facing invoice number (e.g. "INV-0001"), assigned per
            // company at creation (#390). Null on invoices created before
            // numbering existed.
            type: Sequelize.TEXT,
        },
    }, {
        tableName: 'Invoice',
        timestamps: true,
        defaultScope: { where: { invArch: false } }
    });

    return Invoice;
};
