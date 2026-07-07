// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Storage consistency (follow-up to #587). polPrice is a per-unit money value
// (a PurchaseOrderLine price; negative lines are inline credits) that was left
// as DOUBLE when its sibling money columns — cpayAmount, injbAmount — were
// converted to NUMERIC(14,2). Bring it in line so every money column is
// exact-decimal at rest. Behaviour-preserving (no rollup computes with it yet;
// the schema bounds the magnitude). setup/*.sql untouched.
//
// polQty (PurchaseOrderLines) and invitQty (InventoryItem) stay DOUBLE on
// purpose: they are fractional QUANTITIES, not money.

'use strict';

const TABLE = '"dbo"."PurchaseOrderLines"';

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface) {
        await queryInterface.sequelize.query(
            `ALTER TABLE ${TABLE} ALTER COLUMN "polPrice" TYPE numeric(14,2) USING "polPrice"::numeric(14,2);`,
        );
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface) {
        await queryInterface.sequelize.query(
            `ALTER TABLE ${TABLE} ALTER COLUMN "polPrice" TYPE double precision USING "polPrice"::double precision;`,
        );
    },
};
