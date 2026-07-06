// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * RevokedShareLink — the deny-list backing per-link share revocation (#438
 * / audit item #4). Share links are stateless HS256 JWTs, so before this an
 * individual link could not be killed before its `exp` (≤90 days). Each
 * minted link now carries a random `jti`; revoking a link records its `jti`
 * here, and the public view rejects any token whose `jti` is listed.
 *
 * rslCompId records the revoking tenant (scope/audit); rslExpiresAt is the
 * underlying token's expiry so rows can be pruned once the token would have
 * died on its own anyway.
 */
module.exports = (sequelize, Sequelize) => {
    const RevokedShareLink = sequelize.define('RevokedShareLink', {
        rslId: {
            field: 'rslId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        rslJti: {
            field: 'rslJti',
            type: Sequelize.TEXT,
            allowNull: false,
            unique: true,
        },
        rslCompId: {
            field: 'rslCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        rslExpiresAt: {
            field: 'rslExpiresAt',
            type: Sequelize.DATE,
            allowNull: false,
        },
    }, {
        tableName: 'RevokedShareLink',
        timestamps: true,
    });

    return RevokedShareLink;
};
