// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Smoke-test: server.js boots without throwing.
//
// Why this exists: every other test file in this directory builds an
// express() app inline (mounting router + select middleware) rather
// than importing server.js, because importing server.js would call
// `app.listen()` and bind a port. That isolation means startup-time
// validators that fire in `app.use()` calls — express-rate-limit's
// IPv6 helper check, helmet's CSP options validation, etc. — never
// run in the test suite.
//
// We caught one real bug (ERR_ERL_KEY_GEN_IPV6, fixed in PR #113)
// only because someone tried `node server.js` manually. This test
// pins server-boot health into CI: spawn the actual process, wait
// for the "Server listening" log line on stdout/stderr, then SIGTERM
// it. Anything that throws at app-build time before that log line
// (or never reaches it within the timeout) fails the test.

import { describe, test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const SERVER_PATH = resolve(__dirname, '../../server.js');
const TIMEOUT_MS = 15_000;

describe('server.js boots without throwing', () => {
    test('emits the "Server listening" log line within the timeout', async () => {
        // Use a sentinel password so the DB-config init doesn't warn,
        // and a non-standard port to avoid colliding with a real
        // server that might be running on :3000 during local dev.
        const port = 0;  // 0 = let the kernel pick a free port
        const env = {
            ...process.env,
            DB_PASSWORD: 'test-only-not-real',
            PORT: String(port),
            HOST: '127.0.0.1',
            LOG_LEVEL: 'info',
            // Disable rate limiter on a fresh process — it's not the
            // path we're smoke-testing (it ran during app.use() above
            // already, which is the whole point).
            RATE_LIMIT_MAX: '100',
        };
        const child = spawn(process.execPath, [SERVER_PATH], {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        // Wait for "Server listening" or process exit or timeout.
        const result = await new Promise((resolveP) => {
            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                resolveP({ kind: 'timeout' });
            }, TIMEOUT_MS);

            const checkOutput = () => {
                if (/Server listening/.test(stdout + stderr)) {
                    clearTimeout(timer);
                    child.kill('SIGTERM');
                    resolveP({ kind: 'ok' });
                }
            };
            child.stdout.on('data', checkOutput);
            child.stderr.on('data', checkOutput);

            child.on('exit', (code, signal) => {
                clearTimeout(timer);
                resolveP({ kind: 'exit', code, signal });
            });
        });

        // Drain any remaining output buffers.
        await new Promise((r) => setTimeout(r, 50));

        if (result.kind === 'timeout') {
            throw new Error(
                'server.js did not emit "Server listening" within ' +
                `${TIMEOUT_MS}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
            );
        }
        if (result.kind === 'exit' && !/Server listening/.test(stdout + stderr)) {
            throw new Error(
                `server.js exited (code ${result.code}, signal ${result.signal}) ` +
                'before emitting "Server listening".\n' +
                `stdout:\n${stdout}\nstderr:\n${stderr}`,
            );
        }
        // Either we saw the line and killed the process, or the
        // process exited cleanly after we already saw it.
        expect(stdout + stderr).toMatch(/Server listening/);
    }, TIMEOUT_MS + 5_000);
});
