// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * ProductEntry — a line of inventory consumed on a Job.
 *
 * Scope via pentJobId → Job → Customer → custCompId. The existing PG
 * schema spells the archive column "penArch" (note: three letters,
 * not the entity-wide "pent" prefix); we match that spelling rather
 * than rename, to keep the model in sync with what
 * setup/TimeTracker.sql actually creates.
 */
module.exports = (sequelize, Sequelize) => {
    const ProductEntry = sequelize.define('ProductEntry', {
        pentId: {
            field: 'pentId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        pentQty: {
            field: 'pentQty',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        pentJobId: {
            field: 'pentJobId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        pentInvtId: {
            field: 'pentInvtId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        penArch: {
            field: 'penArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        pentTaxable: {
            field: 'pentTaxable',
            type: Sequelize.BOOLEAN,
        },
    }, {
        tableName: 'ProductEntry',
        timestamps: false,
    });

    return ProductEntry;
};
