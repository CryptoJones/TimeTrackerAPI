// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Source-level regression pin: controllers must NOT echo the raw caught
// error back to clients in 5xx responses. The global error handler in
// app/middleware/error-handler.js is the only path allowed to shape
// 5xx bodies — and it deliberately returns `{ message: "Error!",
// requestId? }` with the original error logged but NOT surfaced.
//
// Why this lives as a structural test instead of behavioral:
//
// Triggering every controller's catch path with a mocked DB throw would
// require ~17 separate test files (one per controller) plus per-route
// fixtures for every code path that catches an error. A grep-based test
// on the source pins the policy with a single assertion and catches
// any future regression where someone copy-pastes the old pattern back
// into a new controller.
//
// If a controller needs to surface error detail in the response body
// (e.g., a validation error from zod that already lives behind an
// `expose: true` flag), it should `throw` the error and let the global
// error-handler decide whether to expose it — never echo `String(error)`
// from the catch directly.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const CONTROLLERS_DIR = resolve(__dirname, '../../app/controllers');

describe('controllers do not leak raw error details in 5xx bodies', () => {
    const files = readdirSync(CONTROLLERS_DIR).filter((f) => f.endsWith('.js'));

    test('controllers/ has the expected number of files', () => {
        // Sanity check: if the directory mysteriously empties, the per-file
        // assertions below would vacuously pass. Pin a non-zero floor.
        expect(files.length).toBeGreaterThan(10);
    });

    test.each(files)('%s does not echo `error: String(error)` to clients', (file) => {
        const content = readFileSync(join(CONTROLLERS_DIR, file), 'utf8');
        // The grep that found the original 137-occurrence leak. Catches the
        // common copy-paste variants (whitespace, quoted strings around the
        // arg). If a real need to surface error detail emerges, prefer
        // `next(err)` with `err.expose = true` and let the global
        // error-handler do it under controlled conditions.
        expect(content).not.toMatch(/error:\s*String\(\s*error\s*\)/);
        expect(content).not.toMatch(/error:\s*err\.message/);
        // And the static-string variant the customer controller used to have:
        // `error: "Sequelize Op not available"`. Same principle — anything
        // hardcoded into a 5xx body bypasses the global error-handler's
        // policy.
        expect(content).not.toMatch(/res\.status\(5\d\d\)\.json\([^)]*error:\s*"/);
    });
});
