// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Job — a unit of billable work for a Customer.
 *
 * No direct compId — scope is resolved via jobCustId → Customer.custCompId
 * (see auth.getCompanyIdByCustomerId). Soft-deletes via jobArch.
 * jobInvoiced flips true once an InvoiceJob exists for the row.
 */
module.exports = (sequelize, Sequelize) => {
    const Job = sequelize.define('Job', {
        jobId: {
            field: 'jobId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        jobCustId: {
            field: 'jobCustId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        jobDesc: {
            field: 'jobDesc',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        jobArch: {
            field: 'jobArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        jobInvoiced: {
            field: 'jobInvoiced',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Job',
        timestamps: false,
    });

    return Job;
};
