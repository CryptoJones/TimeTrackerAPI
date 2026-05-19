// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Source-level regression pin: server-handling code must NOT echo the
// raw caught error back to clients in 4xx/5xx responses. The global
// error handler in app/middleware/error-handler.js is the only path
// allowed to shape error bodies — and it deliberately returns
// `{ message: "...", requestId? }` with the original error logged but
// NOT surfaced.
//
// Why this lives as a structural test instead of behavioral:
//
// Triggering every controller's catch path with a mocked DB throw would
// require ~17 separate test files (one per controller) plus per-route
// fixtures for every code path that catches an error. A grep-based test
// on the source pins the policy with a single assertion and catches
// any future regression where someone copy-pastes the old pattern back
// into a new controller / middleware.
//
// If a code path needs to surface error detail in the response body
// (e.g., a validation error from zod that already lives behind an
// `expose: true` flag), it should `throw` the error and let the global
// error-handler decide whether to expose it — never echo `String(error)`
// from the catch directly.
//
// Scope: app/controllers/ AND app/middleware/. The middleware sweep was
// added after #140 fixed controllers but missed validate.js's same-shape
// fallback (`error: String(err)` in the non-ZodError branch of fmt()).
// Cover both directories so the regression net doesn't have holes.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SCAN_DIRS = [
    { abs: resolve(__dirname, '../../app/controllers'), label: 'controllers' },
    { abs: resolve(__dirname, '../../app/middleware'),  label: 'middleware'  },
];

describe('server code does not leak raw error details in error responses', () => {
    for (const { abs, label } of SCAN_DIRS) {
        const files = readdirSync(abs).filter((f) => f.endsWith('.js'));

        test(`${label}/ has the expected number of files`, () => {
            // Sanity check: if the directory mysteriously empties, the per-
            // file assertions below would vacuously pass. Pin a non-zero
            // floor for each scanned dir.
            expect(files.length).toBeGreaterThan(0);
        });

        test.each(files)(`${label}/%s does not echo raw error details to clients`, (file) => {
            const content = readFileSync(join(abs, file), 'utf8');
            // The grep that found the original 137-occurrence leak in
            // controllers. Catches the common copy-paste variants
            // (whitespace, alternative variable names). If a real need to
            // surface error detail emerges, prefer `next(err)` with
            // `err.expose = true` and let the global error-handler do it
            // under controlled conditions.
            //
            // Two field names to defend: `error:` (the original leak
            // location pre-#140) and `message:` (the standard
            // response-shape key — controllers MUST emit a hardcoded
            // generic string here, never the raw error.message or
            // String(err)). The global error-handler is the ONE place
            // allowed to echo err.message when err.expose === true;
            // controllers and middleware route errors through it via
            // `next(err)` instead of building the body themselves.
            expect(content).not.toMatch(/error:\s*String\(\s*error\s*\)/);
            expect(content).not.toMatch(/error:\s*String\(\s*err\s*\)/);
            expect(content).not.toMatch(/error:\s*err\.message/);
            expect(content).not.toMatch(/error:\s*error\.message/);
            // Same patterns guarded against on the `message:` key.
            // Controllers emit fixed strings (`"Error!"`, `"Not found."`,
            // `"Authorization key not sent."`); raw err / error
            // references slipping in would route around the global
            // handler.
            expect(content).not.toMatch(/message:\s*String\(\s*error\s*\)/);
            expect(content).not.toMatch(/message:\s*String\(\s*err\s*\)/);
            expect(content).not.toMatch(/message:\s*err\.message/);
            expect(content).not.toMatch(/message:\s*error\.message/);
            // And the static-string variant the customer controller used to
            // have: `error: "Sequelize Op not available"`. Same principle —
            // anything hardcoded into an error body bypasses the global
            // error-handler's policy.
            expect(content).not.toMatch(/res\.status\([45]\d\d\)\.json\([^)]*error:\s*"/);
        });
    }
});
