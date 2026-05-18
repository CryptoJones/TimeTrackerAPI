// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * InventoryTransaction — movement log entry against an InventoryItem.
 * `invtDirection`: 0 = inbound (received), 1 = outbound (consumed /
 * sold). Direct company scoping via `invtCompanyId`.
 *
 * Note on column naming: the FK to InventoryItem.invitId is stored
 * as `invtInitId` in the migration (BACPAC's "init" prefix carried
 * through). We match what the migration creates rather than
 * renaming.
 */
module.exports = (sequelize, Sequelize) => {
    const InventoryTransaction = sequelize.define('InventoryTransaction', {
        invtId: {
            field: 'invtId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        invtCompanyId:  { field: 'invtCompanyId',  type: Sequelize.INTEGER, allowNull: false },
        invtDirection:  { field: 'invtDirection',  type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        invtArch:       { field: 'invtArch',       type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        invtInitId:     { field: 'invtInitId',     type: Sequelize.INTEGER, allowNull: false },
    }, {
        tableName: 'InventoryTransactions',
        timestamps: true,
        defaultScope: { where: { invtArch: false } }
    });

    return InventoryTransaction;
};
