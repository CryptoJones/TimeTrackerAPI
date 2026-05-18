// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// ESLint flat config. Keep rules minimal and high-signal — the
// goal is to catch the bugs that would otherwise survive review,
// not to enforce style preferences. Style debates belong in code
// review, not in CI failures.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        // Files this config applies to. We exclude generated output
        // and the openapi spec (which has long string literals that
        // would otherwise trip max-len if we ever add it).
        ignores: [
            'node_modules/**',
            'coverage/**',
            'dist/**',
            // sequelize-cli output (DBs etc.)
            '**/*.bacpac',
        ],
    },

    // Server code (CJS, Node globals)
    {
        files: ['app/**/*.js', 'server.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            // The codebase uses unused leading-underscore params as
            // intentional placeholders (e.g. `(err, req, res, next)`
            // four-arg express error handlers must keep `next`).
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            // `==` vs `===` — banned tooling for SQL-emitted string
            // comparisons drifting around. Always strict.
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            // Stray console.* calls were a real bug source pre-pino.
            // Only allow `console.error`/`console.warn` as last-resort
            // fallbacks; everything else routes through `log.*`.
            'no-console': ['error', { allow: ['error', 'warn'] }],
            // Prefer `const` for variables never reassigned.
            'prefer-const': 'error',
            // `var` is banned outright — no hoisting surprises.
            'no-var': 'error',
        },
    },

    // Migrations: pre-existing _ignored second-arg `Sequelize`
    // convention is sequelize-cli's contract. Permit it.
    {
        files: ['app/migrations/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { args: 'none' }],
            eqeqeq: ['error', 'always', { null: 'ignore' }],
        },
    },

    // Tests: vitest globals + ESM-style imports.
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.node,
                // vitest doesn't inject these globally by default,
                // but the codebase imports them explicitly so we
                // don't need to globalize them. Keeping this empty
                // intentionally — lint helps catch a missing import.
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            // Tests intentionally instantiate models with placeholder
            // ids, throw away helpers, mock callbacks, etc.
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            // Tests are allowed to console.log for debugging output
            // that's only seen on failure.
            'no-console': 'off',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'prefer-const': 'warn',
        },
    },

    // Standalone helper scripts in /tmp or one-shots — pull from
    // the same config-less defaults but don't enforce as strictly.
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            ...js.configs.recommended.rules,
        },
    },
];
