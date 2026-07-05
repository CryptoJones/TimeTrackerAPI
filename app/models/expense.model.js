// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Expense — a cost incurred on behalf of a client/project (#416).
 *
 * Scoped to a company via expCompId (direct, like TimeEntry.teCompId).
 * Optionally linked to a Customer (expCustId) and a Job (expJobId).
 * Soft-deletes via expArch. Amount is NUMERIC(14,2); pg returns it as a
 * string, so the getter hands the API a Number.
 */
module.exports = (sequelize, Sequelize) => {
    const Expense = sequelize.define('Expense', {
        expId: {
            field: 'expId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        expCompId: {
            field: 'expCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        expCustId: {
            field: 'expCustId',
            // Nullable: a general company expense may not be client-specific.
            type: Sequelize.INTEGER,
        },
        expJobId: {
            field: 'expJobId',
            // Nullable: an expense may not be tied to a specific project.
            type: Sequelize.INTEGER,
        },
        expCategory: {
            field: 'expCategory',
            type: Sequelize.TEXT,
        },
        expDescription: {
            field: 'expDescription',
            type: Sequelize.TEXT,
        },
        expDate: {
            field: 'expDate',
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        expAmount: {
            field: 'expAmount',
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
            get() {
                const v = this.getDataValue('expAmount');
                return v == null ? null : Number(v);
            },
        },
        expArch: {
            field: 'expArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Expense',
        timestamps: true,
        defaultScope: { where: { expArch: false } }
    });

    return Expense;
};
