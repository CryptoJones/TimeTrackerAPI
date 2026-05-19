// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";
module.exports = (sequelize, Sequelize) => {
    const ApiKey = sequelize.define('ApiKey', {
        akId: {
            field: 'akId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        akKEY: {
            field: 'akKEY',
            // Migration 20260518000000-hash-api-keys.js changed the DB
            // column from `uuid` to `text` so it can hold a SHA-256
            // hex digest (64 chars) without a length cap. The model
            // had been left at `Sequelize.STRING` (varchar(255)),
            // which doesn't break runtime — hashes fit comfortably
            // — but `sequelize.sync()` and any schema-introspection
            // tooling would disagree with the DB. Use TEXT to match.
            type: Sequelize.TEXT
        },
        akCompanyId: {
            field: 'akCompanyId',
            type: Sequelize.INTEGER
        },
        akArchive: {
            field: 'akArchive',
            type: Sequelize.BOOLEAN
        },
        akArchiveDate: {
            field: 'akArchiveDate',
            type: Sequelize.DATE
        }
    },
        {
            tableName: 'ApiKey',
            timestamps: true,
            defaultScope: { where: { akArchive: false } }
        }
    );
    return ApiKey;
}
