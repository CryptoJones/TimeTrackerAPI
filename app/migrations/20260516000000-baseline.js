// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Baseline migration. Records the existing schema (Customer, ApiKey,
// ApiMaster, TimeEntry — created via setup/*.sql) as the starting
// point. Doesn't actually create or drop anything; it just marks
// the line beyond which future schema changes live as proper
// migrations.
//
// Why this exists at all:
//   sequelize-cli refuses to apply a migration list against a
//   "fresh-looking" database if any of the tables referenced in
//   future migrations already exist. By landing this stub first,
//   any operator running `npm run migrate` against an existing
//   database (one that ran setup/*.sql) gets the meta-table
//   populated with this entry, after which subsequent migrations
//   apply cleanly.
//
// For brand-new installs the recommended path is still
// `psql -f setup/*.sql` (or `docker compose up` which runs them via
// the setup service). After that, this stub is recorded in
// dbo.SequelizeMeta and the migration history begins.

'use strict';

module.exports = {
    /** @param {import('sequelize').QueryInterface} queryInterface */
    async up(queryInterface) {
        // Intentional no-op. See header comment.
        // If we ever decide to fully replace setup/*.sql with proper
        // migrations, the body of this function is where those
        // queryInterface.createTable calls would land — and we'd
        // ship a separate "fresh install" migration that's idempotent
        // against the existing schema.
        return Promise.resolve();
    },

    /** @param {import('sequelize').QueryInterface} queryInterface */
    async down(queryInterface) {
        // Rolling the baseline back means "drop the entire schema."
        // That's dangerous enough that we refuse to do it
        // automatically. Operators who really want it can drop
        // tables manually or restore from a backup.
        throw new Error(
            'Cannot roll back baseline migration. Drop the schema manually ' +
            'or restore from backup if you really intend to.',
        );
    },
};
