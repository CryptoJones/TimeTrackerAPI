// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Webhook — an outbound subscription (#69): POST whkUrl when whkEvent
 * fires (or on any event when whkEvent === '*'). whkSecret, when present,
 * signs each delivery. Company-scoped via whkCompId. Soft-deletes via
 * whkArch. whkSecret is write-only at the API layer (never returned).
 */
module.exports = (sequelize, Sequelize) => {
    const Webhook = sequelize.define('Webhook', {
        whkId: {
            field: 'whkId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        whkCompId: {
            field: 'whkCompId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        whkUrl: {
            field: 'whkUrl',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        whkEvent: {
            field: 'whkEvent',
            type: Sequelize.TEXT,
            allowNull: false,
        },
        whkSecret: {
            field: 'whkSecret',
            type: Sequelize.TEXT,
        },
        whkActive: {
            field: 'whkActive',
            type: Sequelize.BOOLEAN,
            defaultValue: true,
        },
        whkArch: {
            field: 'whkArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Webhook',
        timestamps: true,
        defaultScope: { where: { whkArch: false } }
    });

    return Webhook;
};
