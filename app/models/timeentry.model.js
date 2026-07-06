// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * TimeEntry — a single block of time worked, tagged to a customer.
 *
 * Naming follows the existing 2-3-char column-prefix convention
 * ("te" for TimeEntry) used by Customer ("cust"), ApiKey ("ak"),
 * ApiMaster ("am"). All column names are quoted in queries because
 * Postgres lowercases unquoted identifiers and the rest of the
 * schema is camelCase.
 *
 * Soft-deletes via teArch (matches Customer.custArch); rows are
 * never physically removed by the API. Time fields are stored as
 * Postgres TIMESTAMPTZ (no implicit timezone).
 */
module.exports = (sequelize, Sequelize) => {
    const TimeEntry = sequelize.define('TimeEntry', {
        teId: {
            field: 'teId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        teCustId: {
            field: 'teCustId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        teCompId: {
            field: 'teCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        teWorkerId: {
            field: 'teWorkerId',
            // Nullable: the Worker who logged the time. Pre-existing
            // entries and quick ad-hoc time may have none. When set, it
            // resolves the billable rate (Worker.defaultBillingType).
            type: Sequelize.INTEGER,
        },
        teJobId: {
            field: 'teJobId',
            // Nullable: the Job this time was worked against. Lets
            // billable minutes roll up to a project (and its invoice).
            type: Sequelize.INTEGER,
        },
        teBillTypeId: {
            field: 'teBillTypeId',
            // Nullable per-entry rate override (a BillingType). Top tier
            // of rate resolution; NULL means "use the worker default".
            type: Sequelize.INTEGER,
        },
        teTaskId: {
            field: 'teTaskId',
            // Nullable link to a Task under the job (#411). Its taskRate is
            // the most-specific rate tier after a per-entry override.
            type: Sequelize.INTEGER,
        },
        teInvJobId: {
            field: 'teInvJobId',
            // The InvoiceJob line this entry was rolled into (#382), and
            // the "invoiced" marker: NULL = not yet billed, so the
            // roll-up never double-bills the same minutes.
            type: Sequelize.INTEGER,
        },
        teDescription: {
            field: 'teDescription',
            type: Sequelize.TEXT,
        },
        teStartedAt: {
            field: 'teStartedAt',
            type: Sequelize.DATE,
            allowNull: false,
        },
        teEndedAt: {
            field: 'teEndedAt',
            // Nullable: in-flight time entries don't have an end yet.
            type: Sequelize.DATE,
        },
        teMinutes: {
            field: 'teMinutes',
            // Computed on close; convenient denormalized field for
            // reports. Null while the entry is in flight.
            type: Sequelize.INTEGER,
        },
        teBillable: {
            field: 'teBillable',
            type: Sequelize.BOOLEAN,
            defaultValue: true,
        },
        teTags: {
            field: 'teTags',
            // Freeform labels on an entry (#406), a JSONB array of strings.
            // Getter normalizes null → [] so the API always returns an array.
            type: Sequelize.JSONB,
            get() {
                const v = this.getDataValue('teTags');
                return Array.isArray(v) ? v : [];
            },
        },
        teApprovalStatus: {
            field: 'teApprovalStatus',
            // Approval workflow state (#440): open → submitted →
            // approved / rejected. Defaults 'open'.
            type: Sequelize.TEXT,
            defaultValue: 'open',
        },
        teApprovalLevel: {
            field: 'teApprovalLevel',
            // How many approval-chain levels have been cleared (#443/#6). 0
            // until the first level is approved; when it reaches the chain's
            // level count the entry becomes 'approved'. Reset to 0 on
            // submit/reject. Irrelevant when the company has no active chain.
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        teArch: {
            field: 'teArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'TimeEntry',
        timestamps: true,
        defaultScope: { where: { teArch: false } }
    });

    return TimeEntry;
};
