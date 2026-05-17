// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * VersionInfo — global schema/build version record. Not company-scoped;
 * any auth'd caller can read it. Mutations require a master key. No
 * archive column in the underlying table, so DELETE is a hard destroy.
 */
module.exports = (sequelize, Sequelize) => {
    const VersionInfo = sequelize.define('VersionInfo', {
        viId: {
            field: 'viId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        viVersion: {
            field: 'viVersion',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        viDate: {
            field: 'viDate',
            type: Sequelize.DATE,
            allowNull: false,
        },
    }, {
        tableName: 'VersionInfo',
        timestamps: false,
    });

    return VersionInfo;
};
