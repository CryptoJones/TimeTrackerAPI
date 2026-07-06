// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Role — a named billing role (e.g. "Senior Consultant") with a default
 * hourly rate (#412). Company-scoped via roleCompId; a Worker links to a
 * Role via workerRoleId, and the role rate is a tier of rate resolution
 * between the client rate and the worker default (see rate.js).
 * roleRate is NUMERIC(14,2) with a Number getter. Soft-deletes via roleArch.
 */
module.exports = (sequelize, Sequelize) => {
    const Role = sequelize.define('Role', {
        roleId: {
            field: 'roleId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        roleCompId: {
            field: 'roleCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        roleName: {
            field: 'roleName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        roleRate: {
            field: 'roleRate',
            type: Sequelize.DECIMAL(14, 2),
            get() {
                const v = this.getDataValue('roleRate');
                return v == null ? null : Number(v);
            },
        },
        roleArch: {
            field: 'roleArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Role',
        timestamps: true,
        defaultScope: { where: { roleArch: false } }
    });

    return Role;
};
