// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * BillableRule — a company-scoped rule (#415) that classifies a time
 * entry as billable or not based on its job / task / category. Any
 * non-null match column is a required condition; null columns are
 * wildcards, so an all-null rule is a catch-all default. Rules evaluate
 * first-match by bruPriority (ascending) — see app/services/billable-rules.js.
 * Soft-deletes via bruArch.
 */
module.exports = (sequelize, Sequelize) => {
    const BillableRule = sequelize.define('BillableRule', {
        bruId: {
            field: 'bruId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        bruCompId: {
            field: 'bruCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        bruName: {
            field: 'bruName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        bruPriority: {
            field: 'bruPriority',
            type: Sequelize.INTEGER,
            defaultValue: 100,
        },
        bruMatchJobId: {
            field: 'bruMatchJobId',
            type: Sequelize.INTEGER,
        },
        bruMatchTaskId: {
            field: 'bruMatchTaskId',
            type: Sequelize.INTEGER,
        },
        bruMatchCategory: {
            field: 'bruMatchCategory',
            type: Sequelize.TEXT,
        },
        bruBillable: {
            field: 'bruBillable',
            type: Sequelize.BOOLEAN,
            allowNull: false,
        },
        bruActive: {
            field: 'bruActive',
            type: Sequelize.BOOLEAN,
            defaultValue: true,
        },
        bruArch: {
            field: 'bruArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'BillableRule',
        timestamps: true,
        defaultScope: { where: { bruArch: false } }
    });

    return BillableRule;
};
