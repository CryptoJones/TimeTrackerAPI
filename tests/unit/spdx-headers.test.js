// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Source-level regression pin: every JS file in app/, server.js, and
// tests/ carries the Apache-2.0 SPDX header on its first line. The
// project convention surfaces the license at the top of every file
// rather than relying solely on LICENSE at the repo root — easier
// for downstream forks and Apache-2.0 §4(c) re-distributors who
// receive a single file out of context.
//
// 3/18 model files (apikey.model.js, apimaster.model.js,
// customer.model.js) shipped without the header for several months
// before this test landed. Pin the policy here so future copy-paste
// of a header-less template fails CI immediately.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');

// Both production code AND the test suite carry the header per the
// project convention documented above. Scan both so a future test file
// copy-pasted from a header-less template fails CI immediately
// alongside the production-code path.
//
// server.js gets covered via the single-file fallback below.
const SCAN_ROOTS = [
    'app',
    'tests',
];

function walk(absDir, acc = []) {
    for (const entry of readdirSync(absDir)) {
        const abs = join(absDir, entry);
        const stat = statSync(abs);
        if (stat.isDirectory()) {
            walk(abs, acc);
        } else if (entry.endsWith('.js')) {
            acc.push(abs);
        }
    }
    return acc;
}

const files = [];
for (const root of SCAN_ROOTS) {
    files.push(...walk(resolve(REPO_ROOT, root)));
}
files.push(resolve(REPO_ROOT, 'server.js'));

describe('SPDX-License-Identifier header coverage', () => {
    test('discovers a non-trivial number of source files', () => {
        // Floor-check so a misconfigured walk doesn't vacuously pass.
        expect(files.length).toBeGreaterThan(40);
    });

    test.each(files.map((f) => [f.replace(REPO_ROOT + '/', '')]))(
        '%s starts with SPDX-License-Identifier: Apache-2.0',
        (relPath) => {
            const abs = resolve(REPO_ROOT, relPath);
            const first = readFileSync(abs, 'utf8').split('\n', 1)[0];
            expect(first).toBe('// SPDX-License-Identifier: Apache-2.0');
        },
    );
});
