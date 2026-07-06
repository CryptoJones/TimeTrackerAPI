// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Source-level regression pin for #374: controllers must reuse the auth
// context attachAuth already resolved on every /v1 request, via
// `auth.masterFromReq(req, …)` / `auth.companyIdFromReq(req, …)`, instead
// of issuing a SECOND identical `isMaster` / `getCompanyId` DB lookup per
// handler.
//
// A direct `IsMaster(...)` / `GetCompanyId(...)` CALL in a controller is
// exactly the duplicate-round-trip pattern #374 eliminated. This grep-based
// test pins the policy with one assertion per file so a future controller
// (or a copy-paste of the old pattern) can't silently reintroduce it —
// mirroring tests/unit/controller-error-shape.test.js.
//
// Notes on scope / false positives:
//   * Only app/controllers/ is scanned. attachAuth itself (in
//     app/middleware/auth.js) legitimately performs the ONE lookup — it is
//     not a controller and is not scanned.
//   * Some controllers retain `const IsMaster = auth.isMaster;` /
//     `GetCompanyId` aliases purely to export them through an `_internals`
//     test seam. Those appear as bare identifiers (`{ IsMaster,
//     GetCompanyId }`) or in a declaration (`= auth.isMaster`), never
//     immediately followed by `(`, so they do NOT trip the call pattern.
//   * The per-entity resolvers `getCompanyIdBy{CustomerId,JobId,PovId,
//     PohId}` are intentionally left live (attachAuth doesn't cache them).
//     `\bGetCompanyId\s*\(` does not match `GetCompanyIdByCustomerId(` —
//     the character after `GetCompanyId` there is a letter, not `(`.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const CONTROLLERS = resolve(__dirname, '../../app/controllers');

describe('controllers reuse attachAuth context instead of re-querying (#374)', () => {
    const files = readdirSync(CONTROLLERS).filter((f) => f.endsWith('.js'));

    test('the controllers directory is non-empty', () => {
        // If the directory mysteriously empties, the per-file assertions
        // below would vacuously pass. Pin a non-zero floor.
        expect(files.length).toBeGreaterThan(0);
    });

    test.each(files)('%s calls masterFromReq/companyIdFromReq, not the raw lookup', (file) => {
        const content = readFileSync(join(CONTROLLERS, file), 'utf8');
        // A direct call to the raw helpers repeats attachAuth's DB lookup.
        // Handlers must use the context-aware `MasterFromReq(req, …)` /
        // `CompanyIdFromReq(req, …)` instead.
        expect(content).not.toMatch(/\bIsMaster\s*\(/);
        expect(content).not.toMatch(/\bGetCompanyId\s*\(/);
    });
});
