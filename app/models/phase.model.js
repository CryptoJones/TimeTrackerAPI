// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Phase — a date-bounded, budgeted stage of a Job (#408); the unit of
 * milestone billing. Scope resolves through phaseJobId → Job →
 * Customer.custCompId (see auth.getCompanyIdByJobId). Soft-deletes via
 * phaseArch. phaseBudgetAmount is NUMERIC(14,2) with a Number getter.
 */
module.exports = (sequelize, Sequelize) => {
    const Phase = sequelize.define('Phase', {
        phaseId: {
            field: 'phaseId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        phaseJobId: {
            field: 'phaseJobId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        phaseName: {
            field: 'phaseName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        phaseStartDate: {
            field: 'phaseStartDate',
            type: Sequelize.DATEONLY,
        },
        phaseEndDate: {
            field: 'phaseEndDate',
            type: Sequelize.DATEONLY,
        },
        phaseBudgetAmount: {
            field: 'phaseBudgetAmount',
            type: Sequelize.DECIMAL(14, 2),
            get() {
                const v = this.getDataValue('phaseBudgetAmount');
                return v == null ? null : Number(v);
            },
        },
        phaseArch: {
            field: 'phaseArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Phase',
        timestamps: true,
        defaultScope: { where: { phaseArch: false } }
    });

    return Phase;
};
