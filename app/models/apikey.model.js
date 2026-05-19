// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";
module.exports = (sequelize, Sequelize) => {
    const ApiKey = sequelize.define('ApiKey', {
        akId: {
            field: 'akId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        akKEY: {
            field: 'akKEY',
            type: Sequelize.STRING
        },
        akCompanyId: {
            field: 'akCompanyId',
            type: Sequelize.INTEGER
        },
        akArchive: {
            field: 'akArchive',
            type: Sequelize.BOOLEAN
        },
        akArchiveDate: {
            field: 'akArchiveDate',
            type: Sequelize.DATE
        }
    },
        {
            tableName: 'ApiKey',
            timestamps: true,
            defaultScope: { where: { akArchive: false } }
        }
    );
    return ApiKey;
}
