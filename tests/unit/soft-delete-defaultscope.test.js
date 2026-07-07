// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Convention guard: a model that soft-deletes (an `*Arch` / `*Archive`
// BOOLEAN column) MUST carry a `defaultScope` filtering that column, so a
// plain `.findAll()` / `.findByPk()` never returns archived rows. Without it
// a soft-deletable entity would leak "deleted" data into normal reads (and,
// for tenant-scoped entities, potentially into another view). At HEAD all 32
// soft-delete models comply; this fails if a new one is added without the
// scope.

import { describe, test, expect } from 'vitest';

const db = require('../../app/config/db.config.js');

describe('soft-delete models filter archived rows by default', () => {
    function typeKey(attr) {
        return String((attr.type && attr.type.key) || (attr.type && attr.type.constructor && attr.type.constructor.key) || attr.type);
    }

    test('every model with an *Arch/Archive BOOLEAN column has a defaultScope filtering it', () => {
        const offenders = [];
        for (const name of Object.keys(db)) {
            const m = db[name];
            if (!m || !m.rawAttributes || typeof m.getTableName !== 'function') continue;
            const archCol = Object.keys(m.rawAttributes).find(
                (c) => /Arch(ive)?$/i.test(c) && /BOOLEAN/i.test(typeKey(m.rawAttributes[c])),
            );
            if (!archCol) continue; // model has no soft-delete flag
            const ds = m.options && m.options.defaultScope;
            const filtered = !!(ds && ds.where && Object.prototype.hasOwnProperty.call(ds.where, archCol));
            if (!filtered) {
                offenders.push(`${name}: soft-delete column '${archCol}' is not filtered by a defaultScope`);
            }
        }
        // If this fails, add `defaultScope: { where: { <archCol>: false } }` to
        // the model so archived rows don't leak into ordinary reads.
        expect(offenders).toEqual([]);
    });
});
