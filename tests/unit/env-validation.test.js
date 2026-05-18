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
