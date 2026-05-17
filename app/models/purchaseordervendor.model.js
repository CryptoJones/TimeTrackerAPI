// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * PurchaseOrderVendor — a vendor that POs are issued to. Has both a
 * mailing address (where invoices arrive) and a billing address
 * (where checks get sent). Direct company scoping via povCompId.
 * Soft-deletes via povArch.
 */
module.exports = (sequelize, Sequelize) => {
    const PurchaseOrderVendor = sequelize.define('PurchaseOrderVendor', {
        povId: {
            field: 'povId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        povName:             { field: 'povName',             type: Sequelize.TEXT, allowNull: false },
        povMailingAddress1:  { field: 'povMailingAddress1',  type: Sequelize.TEXT, allowNull: false },
        povMailingAddress2:  { field: 'povMailingAddress2',  type: Sequelize.TEXT },
        povMailingCity:      { field: 'povMailingCity',      type: Sequelize.TEXT, allowNull: false },
        povMailingState:     { field: 'povMailingState',     type: Sequelize.TEXT },
        povMailingCountry:   { field: 'povMailingCountry',   type: Sequelize.TEXT },
        povMailingZip:       { field: 'povMailingZip',       type: Sequelize.TEXT },
        povBillingAddress1:  { field: 'povBillingAddress1',  type: Sequelize.TEXT },
        povBillingAddress2:  { field: 'povBillingAddress2',  type: Sequelize.TEXT },
        povBillingCity:      { field: 'povBillingCity',      type: Sequelize.TEXT },
        povBillingState:     { field: 'povBillingState',     type: Sequelize.TEXT },
        povBillingCountry:   { field: 'povBillingCountry',   type: Sequelize.TEXT },
        povBillingZip:       { field: 'povBillingZip',       type: Sequelize.TEXT },
        povPhone:            { field: 'povPhone',            type: Sequelize.TEXT },
        povEMail:            { field: 'povEMail',            type: Sequelize.TEXT },
        povCompId:           { field: 'povCompId',           type: Sequelize.INTEGER, allowNull: false },
        povArch:             { field: 'povArch',             type: Sequelize.BOOLEAN, defaultValue: false },
    }, {
        tableName: 'PurchaseOrderVendors',
        timestamps: false,
    });

    return PurchaseOrderVendor;
};
