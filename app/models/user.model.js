// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * User — a human account for the web app. Owns one workspace (Company)
 * via usrCompId. Password is bcrypt-hashed (usrPasswordHash); the raw
 * password is never stored. Soft-deletes via usrArch.
 *
 * Distinct from ApiKey/ApiMaster, which authenticate integrations. The
 * web app signs up / logs in here and receives a company API key to call
 * the rest of the /v1 surface.
 */
module.exports = (sequelize, Sequelize) => {
    const User = sequelize.define('User', {
        usrId: {
            field: 'usrId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        usrEmail: {
            field: 'usrEmail',
            type: Sequelize.STRING(320),
            allowNull: false,
            unique: true,
        },
        usrPasswordHash: {
            field: 'usrPasswordHash',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        usrCompId: {
            field: 'usrCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        usrArch: {
            field: 'usrArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'User',
        timestamps: true,
        defaultScope: { where: { usrArch: false } },
    });

    return User;
};
