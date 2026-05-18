// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * PurchaseOrderHeader — one row per PO. Auth scopes through
 * pohPovId → PurchaseOrderVendor.povCompId (see
 * auth.getCompanyIdByPovId).
 */
module.exports = (sequelize, Sequelize) => {
    const PurchaseOrderHeader = sequelize.define('PurchaseOrderHeader', {
        pohId: {
            field: 'pohId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        pohDate:       { field: 'pohDate',      type: Sequelize.DATE, allowNull: false },
        pohReference:  { field: 'pohReference', type: Sequelize.TEXT, allowNull: false },
        pohTerms:      { field: 'pohTerms',     type: Sequelize.TEXT, allowNull: false },
        pohPovId:      { field: 'pohPovId',     type: Sequelize.INTEGER, allowNull: false },
        pohArch:       { field: 'pohArch',      type: Sequelize.BOOLEAN, defaultValue: false },
    }, {
        tableName: 'PurchaseOrderHeaders',
        timestamps: true,
        defaultScope: { where: { pohArch: false } }
    });

    return PurchaseOrderHeader;
};
