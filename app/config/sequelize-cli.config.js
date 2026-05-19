// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Sequelize CLI configuration. The CLI (npm run migrate / migrate:undo /
// migrate:status) reads this file via .sequelizerc. All three
// environments resolve their settings from the same env vars the
// runtime uses, so a `docker compose run --rm api npm run migrate`
// works without a separate config block.

require('dotenv').config();

const env = require('./env.js');

const common = {
    username: env.username,
    password: env.password,
    database: env.database,
    host: env.host,
    port: env.port,
    dialect: 'postgres',
    define: {
        schema: 'dbo',
        // Keep in sync with db.config.js's `define.timestamps`.
        // The runtime flipped this to `true` in PR #148 so every
        // domain model inherits auto-populated createdAt/updatedAt
        // instead of carrying an explicit per-model override.
        // sequelize-cli's migration runner doesn't currently exercise
        // this default (migrations use queryInterface directly, not
        // models), but a future contributor adding model-based code
        // paths to a migration would otherwise get silently
        // inconsistent behavior between `npm start` and
        // `npm run migrate`. tests/unit/sequelize-cli-config.test.js
        // pins the two configs in agreement.
        timestamps: true,
    },
    // Migrations land in the dbo schema's SequelizeMeta table so we
    // don't pollute the public schema with framework bookkeeping.
    migrationStorageTableSchema: 'dbo',
};

module.exports = {
    development: common,
    test: common,
    production: common,
};
