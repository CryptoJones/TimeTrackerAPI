// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Retainer — a client prepayment drawn down over time (#426). retAmount
 * is the original deposit; retBalance is what remains. Scope resolves
 * through retCustId → Customer.custCompId. Amounts are NUMERIC(14,2);
 * pg returns them as strings, so the getters hand the API Numbers.
 */
module.exports = (sequelize, Sequelize) => {
    const Retainer = sequelize.define('Retainer', {
        retId: {
            field: 'retId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        retCustId: {
            field: 'retCustId',
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        retAmount: {
            field: 'retAmount',
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
            get() {
                const v = this.getDataValue('retAmount');
                return v == null ? null : Number(v);
            },
        },
        retBalance: {
            field: 'retBalance',
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
            get() {
                const v = this.getDataValue('retBalance');
                return v == null ? null : Number(v);
            },
        },
        retNote: {
            field: 'retNote',
            type: Sequelize.TEXT,
        },
        retArch: {
            field: 'retArch',
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'Retainer',
        timestamps: true,
        defaultScope: { where: { retArch: false } }
    });

    return Retainer;
};
