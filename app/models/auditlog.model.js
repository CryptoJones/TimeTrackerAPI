// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * AuditLog — an append-only record of a successful mutating request
 * (#460): actor (a scoped company or a master key), the HTTP method +
 * path + parsed entity, and the response status. Written by the audit
 * middleware; never updated or soft-deleted.
 */
module.exports = (sequelize, Sequelize) => {
    const AuditLog = sequelize.define('AuditLog', {
        alogId: {
            field: 'alogId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        alogCompId: {
            field: 'alogCompId',
            // The actor's company (null for master keys).
            type: Sequelize.INTEGER,
        },
        alogActor: { field: 'alogActor', type: Sequelize.TEXT, allowNull: false },
        alogMethod: { field: 'alogMethod', type: Sequelize.TEXT, allowNull: false },
        alogPath: { field: 'alogPath', type: Sequelize.TEXT, allowNull: false },
        alogEntity: { field: 'alogEntity', type: Sequelize.TEXT },
        alogStatus: { field: 'alogStatus', type: Sequelize.INTEGER, allowNull: false },
    }, {
        tableName: 'AuditLog',
        timestamps: true,
    });

    return AuditLog;
};
