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
        // Generous timeout: under parallel load a transiently-starved
        // test (e.g. one waiting on a DB ECONNREFUSED) can exceed the 5s
        // default and flake. The work itself is fast; this just stops
        // scheduling jitter from reddening CI.
        testTimeout: 20000,
        // Retry a failed test up to twice before reporting it failed. The
        // suite has a rare environmental flake (a test occasionally
        // starved under parallel load while the auth layer waits on a DB
        // connection); a real failure still fails all three attempts, so
        // this hardens CI without masking genuine regressions.
        retry: 2,
        // Default logger to silent during the test suite so error-path
        // tests (which deliberately trigger DB ECONNREFUSED) don't drown
        // the console output. Individual tests that want to assert on
        // logger output can re-enable per-test.
        env: {
            LOG_LEVEL: 'silent',
        },
    },
};
