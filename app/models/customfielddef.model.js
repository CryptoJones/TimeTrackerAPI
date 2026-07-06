// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * CustomFieldDef — a typed custom-field declaration (#409): cfdName/cfdType
 * for a target cfdEntity ('customer' | 'job' | 'timeentry') within a
 * company. The pure validator in app/services/custom-field.js coerces and
 * checks values against these defs. Company-scoped via cfdCompId.
 * Soft-deletes via cfdArch.
 */
module.exports = (sequelize, Sequelize) => {
    const CustomFieldDef = sequelize.define('CustomFieldDef', {
        cfdId: {
            field: 'cfdId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        cfdCompId: {
            field: 'cfdCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        cfdEntity: {
            field: 'cfdEntity',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        cfdName: {
            field: 'cfdName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        cfdLabel: {
            field: 'cfdLabel',
            type: Sequelize.TEXT,
        },
        cfdType: {
            field: 'cfdType',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        cfdRequired: {
            field: 'cfdRequired',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        cfdArch: {
            field: 'cfdArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'CustomFieldDef',
        timestamps: true,
        defaultScope: { where: { cfdArch: false } }
    });

    return CustomFieldDef;
};
