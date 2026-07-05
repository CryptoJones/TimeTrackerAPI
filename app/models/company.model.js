// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Company — the top-level tenant. compId is referenced by every
 * other entity's *CompId column for auth scoping.
 *
 * Only master keys may create or hard-delete companies. Non-master
 * keys see / patch only their own company (akCompanyId match).
 * Soft-deletes via compArch.
 */
module.exports = (sequelize, Sequelize) => {
    const Company = sequelize.define('Company', {
        compId: {
            field: 'compId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        compName: {
            field: 'compName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        compAddress1: { field: 'compAddress1', type: Sequelize.TEXT },
        compAddress2: { field: 'compAddress2', type: Sequelize.TEXT },
        compCity:     { field: 'compCity',     type: Sequelize.TEXT },
        compState:    { field: 'compState',    type: Sequelize.STRING(2) },
        compZip:      { field: 'compZip',      type: Sequelize.TEXT },
        compPhone:    { field: 'compPhone',    type: Sequelize.STRING(32) },
        compEmail:    { field: 'compEmail',    type: Sequelize.TEXT },
        // Invoice numbering config (#390): prefix + zero-pad width +
        // next counter. Assigned at invoice creation via the
        // row-locked allocator in app/services/invoice-number.js.
        compInvPrefix:  { field: 'compInvPrefix',  type: Sequelize.TEXT,    allowNull: false, defaultValue: 'INV-' },
        compInvPad:     { field: 'compInvPad',     type: Sequelize.INTEGER, allowNull: false, defaultValue: 4 },
        compInvNextSeq: { field: 'compInvNextSeq', type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        // Default sales-tax rate as a fraction (e.g. 0.0725 = 7.25%),
        // #420. pg returns NUMERIC as a string; getter hands out a Number.
        compTaxRate: {
            field: 'compTaxRate',
            type: Sequelize.DECIMAL(6, 4),
            allowNull: false,
            defaultValue: 0,
            get() {
                const v = this.getDataValue('compTaxRate');
                return v == null ? 0 : Number(v);
            },
        },
        compArch: {
            field: 'compArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Company',
        timestamps: true,
        defaultScope: { where: { compArch: false } }
    });

    return Company;
};
