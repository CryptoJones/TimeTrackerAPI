// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Customer — a person/organization a TimeEntry attaches to.
 *
 * Column types + nullability mirror setup/TimeTracker.sql (the
 * authoritative DDL). Earlier this model declared every string field
 * as `Sequelize.STRING` (varchar 255) with no `allowNull` —
 * misrepresenting the underlying `text NOT NULL` columns. Aligning
 * here means sequelize-level validation matches the DB constraint
 * a row would actually fail on, and any downstream consumer reading
 * the model definition (e.g. SDK code-gen, migration diffs) sees the
 * real shape.
 *
 * Soft-deletes via custArch — defaultScope filters `false` so reads
 * never see archived rows without `.unscoped()` (which this codebase
 * never uses; cf. tests/unit/default-scope.test.js).
 */
module.exports = (sequelize, Sequelize) => {
    const Customer = sequelize.define('Customer', {
        custId: {
            field: 'custId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        // text NOT NULL in the DB — see setup/TimeTracker.sql.
        custCompanyName: {
            field: 'custCompanyName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        custFName: {
            field: 'custFName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        custLName: {
            field: 'custLName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        // text NULL — nullable address fields.
        custAddress1: { field: 'custAddress1', type: Sequelize.TEXT },
        custAddress2: { field: 'custAddress2', type: Sequelize.TEXT },
        custCity:     { field: 'custCity',     type: Sequelize.TEXT },
        // varchar(2) — US state codes / Canadian province codes.
        custState:    { field: 'custState',    type: Sequelize.STRING(2) },
        custZip:      { field: 'custZip',      type: Sequelize.TEXT },
        custArch: {
            field: 'custArch',
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        // varchar(32) — phone numbers stored as a string, not parsed.
        custPhone:    { field: 'custPhone',    type: Sequelize.STRING(32) },
        custEmail:    { field: 'custEmail',    type: Sequelize.TEXT },
        custCompId: {
            field: 'custCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        custDefaultRate: {
            field: 'custDefaultRate',
            // Client's default hourly rate (#413); the client tier of rate
            // resolution. Number getter (pg NUMERIC→string).
            type: Sequelize.DECIMAL(14, 2),
            get() {
                const v = this.getDataValue('custDefaultRate');
                return v == null ? null : Number(v);
            },
        },
    }, {
        tableName: 'Customer',
        timestamps: true,
        defaultScope: { where: { custArch: false } },
    });

    return Customer;
};
