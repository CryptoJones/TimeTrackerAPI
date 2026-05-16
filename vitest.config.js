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
    },
};
