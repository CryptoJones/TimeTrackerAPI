// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";
module.exports = (sequelize, Sequelize) => {
    const ApiMaster = sequelize.define('ApiMaster', {
        amId: {
            field: 'amId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        amKEY: {
            field: 'amKEY',
            // Same DB column-type change as ApiKey.akKEY — see
            // migration 20260518000000-hash-api-keys.js. The column
            // is TEXT in PG; the model previously declared STRING
            // (varchar(255)) which still works at runtime but drifts
            // from the DB schema. Aligned to TEXT for parity.
            type: Sequelize.TEXT
        },
        amArchive: {
            field: 'amArchive',
            type: Sequelize.BOOLEAN
        },
        amArchiveDate: {
            field: 'amArchiveDate',
            type: Sequelize.DATE
        }
    },
        {
            tableName: 'ApiMaster',
            timestamps: true,
            defaultScope: { where: { amArchive: false } }
        }
    );

    return ApiMaster;
}
