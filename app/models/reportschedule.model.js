// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * ReportSchedule — "email <report> to <rptschTo> every <cadence>" (#57).
 * Running it renders the report, emails it, then advances rptschNextRun
 * by the cadence (reusing recurring-schedule.js) and stamps rptschLastRun.
 * Company-scoped via rptschCompId. Soft-deletes via rptschArch.
 */
module.exports = (sequelize, Sequelize) => {
    const ReportSchedule = sequelize.define('ReportSchedule', {
        rptschId: {
            field: 'rptschId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        rptschCompId: {
            field: 'rptschCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        rptschReport: {
            field: 'rptschReport',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        rptschTo: {
            field: 'rptschTo',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        rptschCadence: {
            field: 'rptschCadence',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        rptschNextRun: {
            field: 'rptschNextRun',
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        rptschLastRun: {
            field: 'rptschLastRun',
            type: Sequelize.DATEONLY,
        },
        rptschActive: {
            field: 'rptschActive',
            type: Sequelize.BOOLEAN,
            defaultValue: true,
        },
        rptschArch: {
            field: 'rptschArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'ReportSchedule',
        timestamps: true,
        defaultScope: { where: { rptschArch: false } }
    });

    return ReportSchedule;
};
