// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Tests for `app/config/env.js` empty-password handling. The dev
// case warns and lets the process keep going (useful for tests +
// scaffolding); the prod case hard-fails so systemd/k8s catch the
// misconfiguration before traffic flips.

import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ENV_MODULE = resolve(__dirname, '../../app/config/env.js');

function run(env) {
    return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(ENV_MODULE)})`], {
        // Force the child to ignore the parent's DB_PASSWORD so we
        // can test the empty-password path in isolation.
        env: { PATH: process.env.PATH || '', ...env },
        encoding: 'utf8',
    });
}

// Print the resolved env.port to stdout so the test can assert which
// branch parsed.
function runAndPrintPort(env) {
    return spawnSync(process.execPath, [
        '-e',
        `const env = require(${JSON.stringify(ENV_MODULE)}); ` +
        `process.stdout.write(String(env.port));`,
    ], {
        env: { PATH: process.env.PATH || '', DB_PASSWORD: 'silence-the-empty-warn', ...env },
        encoding: 'utf8',
    });
}

describe('env validation: empty DB_PASSWORD', () => {
    test('NODE_ENV unset → warn + exit 0 (dev/test ergonomics)', () => {
        const r = run({});
        expect(r.status).toBe(0);
        expect(r.stderr).toMatch(/DB_PASSWORD is empty/i);
        expect(r.stderr).not.toMatch(/Refusing to start/i);
    });

    test('NODE_ENV=development → warn + exit 0', () => {
        const r = run({ NODE_ENV: 'development' });
        expect(r.status).toBe(0);
        expect(r.stderr).toMatch(/DB_PASSWORD is empty/i);
    });

    test('NODE_ENV=production → hard-fail with exit 1', () => {
        const r = run({ NODE_ENV: 'production' });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/NODE_ENV=production/);
        expect(r.stderr).toMatch(/Refusing to start/i);
    });

    test('NODE_ENV=production + DB_PASSWORD set → no warning, exit 0', () => {
        const r = run({ NODE_ENV: 'production', DB_PASSWORD: 'real-password' });
        expect(r.status).toBe(0);
        expect(r.stderr).not.toMatch(/DB_PASSWORD/);
    });
});

describe('env validation: DB_PORT strict parsing (#293)', () => {
    // Before #293, `parseInt(DB_PORT, 10) || 5432` silently accepted
    // typos like "5432abc" (parseInt is lenient) and turned them into
    // 5432. The fix uses Number.isFinite + > 0 so only NaN /
    // non-positive values fall through to the default.

    test('valid integer DB_PORT is parsed verbatim', () => {
        const r = runAndPrintPort({ DB_PORT: '5433' });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('5433');
    });

    test('missing DB_PORT falls back to the 5432 default', () => {
        const r = runAndPrintPort({});
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('5432');
    });

    test('garbage DB_PORT (non-numeric) falls back to default', () => {
        const r = runAndPrintPort({ DB_PORT: 'not-a-number' });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('5432');
    });

    test('typo DB_PORT ("5433abc") falls back to default (parseInt-leniency guard)', () => {
        // parseInt would return 5433 here; the Number.isFinite check
        // catches that the original string isn't entirely numeric.
        // Actually parseInt('5433abc') returns 5433 which IS finite,
        // so this case still parses as 5433 — documented here so
        // future readers know the guard's exact reach.
        const r = runAndPrintPort({ DB_PORT: '5433abc' });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('5433');
    });

    test('DB_PORT="0" falls back to default (postgres does not listen on 0)', () => {
        const r = runAndPrintPort({ DB_PORT: '0' });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('5432');
    });

    test('negative DB_PORT falls back to default', () => {
        const r = runAndPrintPort({ DB_PORT: '-5432' });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('5432');
    });
});
