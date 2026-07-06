// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Invitation — a pending invite to join a company workspace (#458).
 * invtTokenHash is the SHA-256 of a one-time token emailed to invtEmail;
 * accepting provisions a User with invtRole. invtAcceptedAt marks it
 * consumed. Company-scoped via invtCompId. Soft-deletes via invtArch.
 */
module.exports = (sequelize, Sequelize) => {
    const Invitation = sequelize.define('Invitation', {
        invtId: {
            field: 'invtId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        invtCompId: {
            field: 'invtCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        invtEmail: {
            field: 'invtEmail',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        invtRole: {
            field: 'invtRole',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        invtTokenHash: {
            field: 'invtTokenHash',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        invtExpires: {
            field: 'invtExpires',
            type: Sequelize.DATE,
            allowNull: false,
        },
        invtAcceptedAt: {
            field: 'invtAcceptedAt',
            type: Sequelize.DATE,
        },
        invtArch: {
            field: 'invtArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Invitation',
        timestamps: true,
        defaultScope: { where: { invtArch: false } }
    });

    return Invitation;
};
