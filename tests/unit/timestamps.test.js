// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies every domain model has `timestamps: true` so Sequelize
// auto-populates `createdAt`/`updatedAt` on every write. Paired
// with migration `20260520000000-timestamps.js` which adds the
// underlying columns.

import { describe, test, expect } from 'vitest';

const db = require('../../app/config/db.config.js');

// IdempotencyKey manages its own ikCreatedAt/ikExpiresAt columns
// and is intentionally excluded from the auto-timestamp set.
const MODELS_WITH_TIMESTAMPS = [
    'ApiKey',
    'ApiMaster',
    'BillingType',
    'Company',
    'Customer',
    'CustomerPayment',
    'InventoryItem',
    'InventoryTransaction',
    'Invoice',
    'InvoiceJob',
    'Job',
    'ProductEntry',
    'PurchaseOrderHeader',
    'PurchaseOrderLine',
    'PurchaseOrderVendor',
    'TimeEntry',
    'VersionInfo',
    'Worker',
];

describe('every domain model has timestamps enabled', () => {
    test.each(MODELS_WITH_TIMESTAMPS)(
        '%s carries timestamps:true on its options',
        (modelName) => {
            const model = db[modelName];
            expect(model, `${modelName} should be defined on db`).toBeDefined();
            expect(model.options.timestamps).toBe(true);
        },
    );

    test.each(MODELS_WITH_TIMESTAMPS)(
        '%s exposes createdAt / updatedAt attributes on the model',
        (modelName) => {
            const attrs = db[modelName].rawAttributes;
            expect(attrs).toBeDefined();
            // Sequelize names them according to the model's defaults
            // (camelCase here since none of the models override
            // createdAt/updatedAt keys).
            expect(attrs.createdAt).toBeDefined();
            expect(attrs.updatedAt).toBeDefined();
        },
    );
});
