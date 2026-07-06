// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * ApprovalChain — an ordered list of approver levels a timesheet must
 * clear (#443). apchLevels is [{ level, approverRole }] (JSONB); the pure
 * resolver in app/services/approval-chain.js computes the next required
 * level/role. Company-scoped via apchCompId. Soft-deletes via apchArch.
 */
module.exports = (sequelize, Sequelize) => {
    const ApprovalChain = sequelize.define('ApprovalChain', {
        apchId: {
            field: 'apchId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        apchCompId: {
            field: 'apchCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        apchName: {
            field: 'apchName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        apchLevels: {
            field: 'apchLevels',
            type: Sequelize.JSONB,
            allowNull: false,
        },
        apchActive: {
            field: 'apchActive',
            type: Sequelize.BOOLEAN,
            defaultValue: true,
        },
        apchArch: {
            field: 'apchArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'ApprovalChain',
        timestamps: true,
        defaultScope: { where: { apchArch: false } }
    });

    return ApprovalChain;
};
