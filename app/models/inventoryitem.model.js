// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * InventoryItem — a sellable / consumable item tracked by quantity.
 *
 * Soft-deletes via invitArch (added in the same migration that landed
 * the missing PurchaseOrder* tables; the original PG schema in
 * setup/TimeTracker.sql lacked an archive column).
 */
module.exports = (sequelize, Sequelize) => {
    const InventoryItem = sequelize.define('InventoryItem', {
        invitId: {
            field: 'invitId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        invitDescription: {
            field: 'invitDescription',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        invitQty: {
            field: 'invitQty',
            type: Sequelize.DOUBLE,
            allowNull: false,
        },
        invitCompId: {
            field: 'invitCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        invitArch: {
            field: 'invitArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'InventoryItem',
        timestamps: true,
        defaultScope: { where: { invitArch: false } }
    });

    return InventoryItem;
};
