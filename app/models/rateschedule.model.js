// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * RateSchedule — a named rate effective over a date range (#414).
 * rschEffectiveTo is NULL for an open-ended (current) rate. Company-scoped
 * via rschCompId; the effective rate on a given day is resolved by
 * app/services/rate-schedule.js. rschRate is NUMERIC(14,2) with a Number
 * getter. Soft-deletes via rschArch.
 */
module.exports = (sequelize, Sequelize) => {
    const RateSchedule = sequelize.define('RateSchedule', {
        rschId: {
            field: 'rschId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        rschCompId: {
            field: 'rschCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        rschName: {
            field: 'rschName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        rschRate: {
            field: 'rschRate',
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
            get() {
                const v = this.getDataValue('rschRate');
                return v == null ? null : Number(v);
            },
        },
        rschEffectiveFrom: {
            field: 'rschEffectiveFrom',
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        rschEffectiveTo: {
            field: 'rschEffectiveTo',
            type: Sequelize.DATEONLY,
        },
        rschArch: {
            field: 'rschArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'RateSchedule',
        timestamps: true,
        defaultScope: { where: { rschArch: false } }
    });

    return RateSchedule;
};
