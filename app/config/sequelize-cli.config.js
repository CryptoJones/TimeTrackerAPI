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
        timestamps: false,
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
