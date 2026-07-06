// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { PII_FIELDS, NON_NULL_PII, PLACEHOLDER, anonymizedValues, streamRelationArray } from '../../app/services/gdpr.js';

describe('gdpr (#461)', () => {
    test('anonymizedValues covers every PII field and nothing else', () => {
        const v = anonymizedValues();
        expect(Object.keys(v).sort()).toEqual([...PII_FIELDS].sort());
        // Financial / identity columns are untouched.
        expect('custDefaultRate' in v).toBe(false);
        expect('custCompId' in v).toBe(false);
        expect('custId' in v).toBe(false);
    });

    test('NOT-NULL columns get the placeholder; nullable ones null out', () => {
        const v = anonymizedValues();
        for (const f of NON_NULL_PII) expect(v[f]).toBe(PLACEHOLDER);
        expect(v.custEmail).toBeNull();
        expect(v.custPhone).toBeNull();
        expect(v.custAddress1).toBeNull();
        expect(v.custZip).toBeNull();
    });
});

// streamRelationArray: keyset-paginated streaming (audit item #3). A fake
// model returns rows in PK order past the `pk > lastId` cursor, capped at the
// batch limit — the same contract Sequelize's findAll honours.
describe('streamRelationArray — bounded, keyset-paginated streaming', () => {
    const OP_GT = Symbol('gt');
    const Op = { gt: OP_GT };
    // rows: [{id, v}, ...] sorted by id. Records the largest `limit` requested
    // so we can assert peak batch size is bounded.
    function fakeModel(pk, rows, seenLimits) {
        return {
            primaryKeyAttribute: pk,
            findAll: async ({ where, order, limit }) => {
                if (seenLimits) seenLimits.push(limit);
                // ORDER BY pk ASC, WHERE pk > cursor, LIMIT.
                expect(order).toEqual([[pk, 'ASC']]);
                const cursor = where[pk][OP_GT];
                return rows.filter((r) => r[pk] > cursor).slice(0, limit)
                    .map((r) => ({ ...r, get: (k) => r[k] }));
            },
        };
    }
    function collect(rows, batchSize) {
        const chunks = [];
        const seenLimits = [];
        const model = fakeModel('id', rows, seenLimits);
        return streamRelationArray(model, { fk: 1 }, Op, (c) => chunks.push(c), batchSize)
            .then((total) => ({ total, chunks, seenLimits }));
    }

    test('streams every row across multiple batches, comma-joined + parseable', async () => {
        const rows = [1, 2, 3, 4, 5].map((id) => ({ id, v: `r${id}` }));
        const { total, chunks, seenLimits } = await collect(rows, 2);
        expect(total).toBe(5);
        // Reassembling the chunks inside [] yields the ordered rows.
        const parsed = JSON.parse('[' + chunks.join('') + ']');
        expect(parsed.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
        // Never requested more than the batch size (bounded memory).
        expect(Math.max(...seenLimits)).toBe(2);
        // 3 batches for 5 rows @ 2: [1,2],[3,4],[5].
        expect(seenLimits.length).toBe(3);
    });

    test('empty relation → 0 rows, one empty batch, no chunks', async () => {
        const { total, chunks, seenLimits } = await collect([], 500);
        expect(total).toBe(0);
        expect(chunks).toEqual([]);
        expect(seenLimits).toEqual([500]);
    });

    test('a full final batch triggers one more (empty) probe, then stops', async () => {
        // Exactly batchSize rows: first batch is full → loop again → empty → stop.
        const rows = [1, 2].map((id) => ({ id, v: id }));
        const { total, seenLimits } = await collect(rows, 2);
        expect(total).toBe(2);
        expect(seenLimits.length).toBe(2); // [1,2] then the empty probe
    });
});

// Regression guard: pin PII_FIELDS against the ACTUAL Customer columns, not
// against itself. The original unit test only checked anonymizedValues()
// vs PII_FIELDS — so a future PII column added to the model but forgotten
// in PII_FIELDS would leave residual personal data after a right-to-erasure
// and no test would fail. This closes that gap.
describe('gdpr scrub covers every Customer PII column (regression guard)', () => {
    // db.config defines every model at require-time; rawAttributes is
    // available without a live DB connection.
    const db = require('../../app/config/db.config.js');

    // Columns on Customer that are deliberately NOT personal data. Adding an
    // entry here is a conscious "this is not PII" decision — which is exactly
    // the point: a new column must be classified, not silently ignored.
    const NON_PII = new Set([
        'custId',          // primary key
        'custArch',        // soft-delete flag
        'custCompId',      // tenant scope (FK)
        'custDefaultRate', // billing rate — not personal data
        'createdAt',
        'updatedAt',
    ]);

    test('PII_FIELDS equals (Customer columns − non-PII allowlist)', () => {
        const cols = Object.keys(db.Customer.rawAttributes);
        const expectedPII = cols.filter((c) => !NON_PII.has(c)).sort();
        // If this fails, a column was added to the Customer model: either add
        // it to gdpr.js PII_FIELDS (if it holds personal data) or to NON_PII
        // above (if it does not). Silence here would mean a right-to-erasure
        // request leaves residual PII behind.
        expect([...PII_FIELDS].sort()).toEqual(expectedPII);
    });
});
