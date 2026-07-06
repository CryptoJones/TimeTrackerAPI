// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Receipt — a file attached to an Expense (#419). rcptData holds the raw
 * bytes (bytea); it is large, so list/fetch endpoints select an explicit
 * attribute set that EXCLUDES it — only the download endpoint reads it.
 * Company-scoped via rcptCompId (denormalized from the expense).
 * Soft-deletes via rcptArch.
 */
module.exports = (sequelize, Sequelize) => {
    const Receipt = sequelize.define('Receipt', {
        rcptId: {
            field: 'rcptId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        rcptExpId: {
            field: 'rcptExpId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        rcptCompId: {
            field: 'rcptCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        rcptFilename: {
            field: 'rcptFilename',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        rcptContentType: {
            field: 'rcptContentType',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        rcptSize: {
            field: 'rcptSize',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        rcptData: {
            field: 'rcptData',
            type: Sequelize.BLOB,
            allowNull: false,
        },
        rcptArch: {
            field: 'rcptArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Receipt',
        timestamps: true,
        defaultScope: { where: { rcptArch: false } }
    });

    return Receipt;
};
