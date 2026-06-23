// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Human user accounts for the web app (the API-key model is for
// integrations). One user owns one workspace (Company). Passwords are
// bcrypt-hashed (never stored plaintext). Email is unique.
//
// Identifier "User" is quoted everywhere (it's a SQL reserved word
// unquoted) — consistent with the rest of the schema, which quotes all
// identifiers.

'use strict';

const SCHEMA = 'dbo';

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
            CREATE TABLE IF NOT EXISTS "${SCHEMA}"."User" (
                "usrId" SERIAL PRIMARY KEY,
                "usrEmail" VARCHAR(320) NOT NULL UNIQUE,
                "usrPasswordHash" TEXT NOT NULL,
                "usrCompId" INTEGER NOT NULL,
                "usrArch" BOOLEAN NOT NULL DEFAULT false,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "${SCHEMA}"."User"`);
    },
};
