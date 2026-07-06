// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Task — a unit of work / activity under a Job (#407). Scope resolves
 * through taskJobId → Job → Customer.custCompId (see
 * auth.getCompanyIdByJobId). Soft-deletes via taskArch.
 */
module.exports = (sequelize, Sequelize) => {
    const Task = sequelize.define('Task', {
        taskId: {
            field: 'taskId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        taskJobId: {
            field: 'taskJobId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        taskName: {
            field: 'taskName',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        taskDesc: {
            field: 'taskDesc',
            type: Sequelize.TEXT,
        },
        taskArch: {
            field: 'taskArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Task',
        timestamps: true,
        defaultScope: { where: { taskArch: false } }
    });

    return Task;
};
