// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Vitest configuration. The test suite is hand-mocked at the Sequelize
// model layer so it runs without a live PostgreSQL — see tests/README.md
// for the full conventions.

export default {
    test: {
        include: ['tests/**/*.test.js'],
        environment: 'node',
        globals: false,
        reporters: ['default'],
        // Default logger to silent during the test suite so error-path
        // tests (which deliberately trigger DB ECONNREFUSED) don't drown
        // the console output. Individual tests that want to assert on
        // logger output can re-enable per-test.
        env: {
            LOG_LEVEL: 'silent',
        },
    },
};
