// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * User — a person who signs in to a company (#444). Company-scoped via
 * userCompId. userPasswordHash is a scrypt digest (app/services/password.js)
 * and is WRITE-ONLY at the API layer — no endpoint ever returns it.
 * Soft-deletes via userArch. Foundation for login (#445) / reset (#446);
 * separate from the existing API-key auth.
 */
module.exports = (sequelize, Sequelize) => {
    const User = sequelize.define('User', {
        userId: {
            field: 'userId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        userCompId: {
            field: 'userCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        userEmail: {
            field: 'userEmail',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        userName: {
            field: 'userName',
            type: Sequelize.TEXT,
        },
        userRole: {
            field: 'userRole',
            // RBAC role (#448): owner|admin|manager|member|viewer. The
            // permission matrix lives in app/services/rbac.js.
            type: Sequelize.TEXT,
            defaultValue: 'member',
        },
        userPasswordHash: {
            field: 'userPasswordHash',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        userResetTokenHash: {
            field: 'userResetTokenHash',
            // SHA-256 of a one-time password-reset token (#446); null when
            // no reset is pending. Write-only, never returned.
            type: Sequelize.TEXT,
        },
        userResetExpires: {
            field: 'userResetExpires',
            type: Sequelize.DATE,
        },
        userArch: {
            field: 'userArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'User',
        timestamps: true,
        defaultScope: { where: { userArch: false } }
    });

    return User;
};
