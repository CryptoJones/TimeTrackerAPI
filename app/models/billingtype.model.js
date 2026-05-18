// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * BillingType — a named hourly rate that a Worker can default to.
 *
 * Soft-deletes via btArch. Scoped to a company via btCompId.
 */
module.exports = (sequelize, Sequelize) => {
    const BillingType = sequelize.define('BillingType', {
        btId: {
            field: 'btId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        btName: {
            field: 'btName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        btHourlyRate: {
            field: 'btHourlyRate',
            type: Sequelize.DOUBLE,
            allowNull: false,
        },
        btArch: {
            field: 'btArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        btCompId: {
            field: 'btCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
    }, {
        tableName: 'BillingType',
        timestamps: false,
        defaultScope: { where: { btArch: false } }
    });

    return BillingType;
};
