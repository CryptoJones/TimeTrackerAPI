// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
'use strict';
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
            type: Sequelize.STRING
            
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