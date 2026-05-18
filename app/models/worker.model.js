// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Worker — a person who can log time against jobs in a company.
 *
 * Follows the same 2-3-char column-prefix convention as Customer ("cust")
 * and TimeEntry ("te"): every column starts with "worker". Quoted in
 * queries because Postgres lowercases unquoted identifiers and the rest
 * of the schema is camelCase.
 *
 * Soft-deletes via workerArch (matches Customer.custArch). Workers are
 * scoped to a company via workerCompId; only master keys or keys whose
 * akCompanyId equals workerCompId may see/mutate the row.
 */
module.exports = (sequelize, Sequelize) => {
    const Worker = sequelize.define('Worker', {
        workerId: {
            field: 'workerId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        workerFName: {
            field: 'workerFName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        workerLName: {
            field: 'workerLName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        workerTitle: {
            field: 'workerTitle',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        workerDefaultBillType: {
            field: 'workerDefaultBillType',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        workerArch: {
            field: 'workerArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        workerCompId: {
            field: 'workerCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
    }, {
        tableName: 'Worker',
        timestamps: false,
        defaultScope: { where: { workerArch: false } }
    });

    return Worker;
};
