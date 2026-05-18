// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies every soft-deletable model carries a defaultScope that
// filters out archived rows. The scope is the load-bearing piece of
// the P2-E refactor — without it the per-controller `<arch>: false`
// filters are no longer the single source of truth, and any future
// query that forgets the filter would silently include archived rows.

import { describe, test, expect } from 'vitest';

const db = require('../../app/config/db.config.js');

// Model → archive column. VersionInfo is intentionally excluded — it
// has no soft-delete semantics (it's a single-row schema-version row).
const ARCHIVE_COLUMNS = {
    ApiKey:               'akArchive',
    ApiMaster:            'amArchive',
    BillingType:          'btArch',
    Company:              'compArch',
    Customer:             'custArch',
    CustomerPayment:      'cpayArch',
    InventoryItem:        'invitArch',
    InventoryTransaction: 'invtArch',
    InvoiceJob:           'injbArch',
    Invoice:              'invArch',
    Job:                  'jobArch',
    ProductEntry:         'penArch',
    PurchaseOrderHeader:  'pohArch',
    PurchaseOrderLine:    'polArch',
    PurchaseOrderVendor:  'povArch',
    TimeEntry:            'teArch',
    Worker:               'workerArch',
};

describe('defaultScope: every soft-deletable model filters archived rows by default', () => {
    test.each(Object.entries(ARCHIVE_COLUMNS))(
        '%s carries defaultScope filtering %s = false',
        (modelName, archCol) => {
            const model = db[modelName];
            expect(model, `${modelName} should be defined`).toBeDefined();

            // Sequelize stores the resolved default scope on
            // `model.options.defaultScope` (and also exposes it via the
            // private `_scope` after a fresh model load).
            const ds = model.options && model.options.defaultScope;
            expect(ds, `${modelName} should have a defaultScope`).toBeDefined();
            expect(ds.where, `${modelName}.defaultScope.where should be set`).toBeDefined();
            expect(ds.where[archCol]).toBe(false);
        },
    );

    test('VersionInfo has no defaultScope (no soft-delete column)', () => {
        const ds = db.VersionInfo
            && db.VersionInfo.options
            && db.VersionInfo.options.defaultScope;
        // Either undefined or an empty object — both are fine. The
        // intent of this test is to document that VersionInfo is
        // deliberately not soft-deletable, not to enforce a specific
        // shape for "no scope."
        if (ds && Object.keys(ds).length > 0) {
            expect(ds.where).toEqual({});
        } else {
            expect(ds || {}).toEqual({});
        }
    });
});
