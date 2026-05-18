// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Adds the IdempotencyKey table for Stripe-style idempotent POSTs.
//
// Background (audit issue #73, P3-G):
//   POST endpoints that create resources (TimeEntry, Customer, Job,
//   Invoice, payment rows, etc.) can be inadvertently double-submitted
//   when a network blip causes a client to retry after the server has
//   already accepted the original. Without server-side dedup the
//   retry creates a second row.
//
//   The middleware in app/middleware/idempotency.js stores the
//   response body + status of the FIRST request keyed by
//   (authKey hash, method+path hash, Idempotency-Key header). A
//   retry with the same key replays the stored response. A retry
//   with a DIFFERENT body but the same key returns 409 to flag the
//   collision.
//
// Schema:
//   ikId            bigserial PK
//   ikScope         text     — sha256(authKey || ':' || method || path)
//   ikKey           text     — the raw Idempotency-Key header value
//   ikRequestHash   text     — sha256 of the canonical JSON request body
//   ikResponseStatus int
//   ikResponseBody  jsonb
//   ikCreatedAt     timestamptz default now()
//   ikExpiresAt     timestamptz — createdAt + 24h
//
//   UNIQUE (ikScope, ikKey) — within a single (auth, route) the
//   client picks the key, so the constraint catches both reused-key
//   replays and concurrent first-writes via INSERT ... ON CONFLICT.
//
// Cleanup: rows past ikExpiresAt are pruned best-effort by the
// middleware on each request (cheap DELETE WHERE expired). No
// background job needed; a tiny burst of expired rows is fine.

'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const SCHEMA = 'dbo';
        const sequelize = queryInterface.sequelize;

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS "${SCHEMA}"."IdempotencyKey" (
                "ikId" BIGSERIAL PRIMARY KEY,
                "ikScope" TEXT NOT NULL,
                "ikKey" TEXT NOT NULL,
                "ikRequestHash" TEXT NOT NULL,
                "ikResponseStatus" INTEGER NOT NULL,
                "ikResponseBody" JSONB NOT NULL,
                "ikCreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "ikExpiresAt" TIMESTAMPTZ NOT NULL
            );
        `);

        await sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_scope_key_uidx"
                ON "${SCHEMA}"."IdempotencyKey" ("ikScope", "ikKey");
        `);
        // Cheap range scan for the cleanup pass.
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS "IdempotencyKey_expires_idx"
                ON "${SCHEMA}"."IdempotencyKey" ("ikExpiresAt");
        `);
    },

    async down(queryInterface, Sequelize) {
        const SCHEMA = 'dbo';
        const sequelize = queryInterface.sequelize;
        await sequelize.query(`DROP TABLE IF EXISTS "${SCHEMA}"."IdempotencyKey"`);
    },
};
