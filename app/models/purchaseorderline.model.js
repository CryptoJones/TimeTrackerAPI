// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * PurchaseOrderLine — a line item on a PurchaseOrderHeader. Auth
 * scopes through polpoh → PurchaseOrderHeader → vendor.povCompId
 * (see auth.getCompanyIdByPohId).
 *
 * Note: the FK column is named "polpoh" in the BACPAC and PG
 * schema — lowercase, no separator. We match the existing column
 * name rather than rename to "polPohId" because that's what
 * setup/TimeTracker.sql + the migration actually create.
 */
module.exports = (sequelize, Sequelize) => {
    const PurchaseOrderLine = sequelize.define('PurchaseOrderLine', {
        polId: {
            field: 'polId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        polpoh:       { field: 'polpoh',      type: Sequelize.INTEGER, allowNull: false },
        polItemDesc:  { field: 'polItemDesc', type: Sequelize.TEXT, allowNull: false },
        polQty:       { field: 'polQty',      type: Sequelize.DOUBLE, allowNull: false },
        polPrice:     { field: 'polPrice',    type: Sequelize.DOUBLE, allowNull: false },
        polInvtId:    { field: 'polInvtId',   type: Sequelize.INTEGER, allowNull: false },
        polArch:      { field: 'polArch',     type: Sequelize.BOOLEAN, defaultValue: false },
    }, {
        tableName: 'PurchaseOrderLines',
        timestamps: true,
        defaultScope: { where: { polArch: false } }
    });

    return PurchaseOrderLine;
};
