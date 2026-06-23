// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies the Sequelize association graph wired up in db.config.js.
// We don't hit the DB — we just walk Model.associations and assert
// each expected belongsTo / hasMany is present with the correct
// foreign-key column. This catches typos and column-name drift early.

import { describe, test, expect } from 'vitest';

// Import db.config.js indirectly to avoid the env-var warning chatter
// that the api tests' mock side-steps. We don't actually open a
// connection here; Sequelize doesn't connect until a query runs.
const db = require('../../app/config/db.config.js');

function assertAssoc(modelName, kind, fkColumn, targetName) {
    const model = db[modelName];
    expect(model, `${modelName} should be defined on db`).toBeDefined();
    const assocs = Object.values(model.associations || {});
    const match = assocs.find(a =>
        a.associationType === kind &&
        a.foreignKey === fkColumn &&
        a.target.name === targetName,
    );
    expect(match, `${modelName} should ${kind} ${targetName} via ${fkColumn}`).toBeDefined();
}

describe('association graph: Company is the tenancy root', () => {
    test.each([
        ['Customer',             'custCompId'],
        ['Worker',               'workerCompId'],
        ['BillingType',          'btCompId'],
        ['InventoryItem',        'invitCompId'],
        ['ApiKey',               'akCompanyId'],
        ['TimeEntry',            'teCompId'],
        ['PurchaseOrderVendor',  'povCompId'],
        ['InventoryTransaction', 'invtCompanyId'],
    ])('%s belongsTo Company via %s', (entity, fk) => {
        assertAssoc(entity, 'BelongsTo', fk, 'Company');
    });

    test.each([
        ['Customer', 'custCompId'],
        ['Worker',   'workerCompId'],
        ['ApiKey',   'akCompanyId'],
    ])('Company hasMany %s via %s', (entity, fk) => {
        assertAssoc('Company', 'HasMany', fk, entity);
    });
});

describe('association graph: Customer fan-out', () => {
    test.each([
        ['TimeEntry',       'teCustId'],
        ['Job',             'jobCustId'],
        ['Invoice',         'invCustId'],
        ['CustomerPayment', 'cpayCustId'],
    ])('%s belongsTo Customer via %s', (entity, fk) => {
        assertAssoc(entity, 'BelongsTo', fk, 'Customer');
    });
});

describe('association graph: Job line items', () => {
    test('InvoiceJob belongsTo Job via injbJobId', () => {
        assertAssoc('InvoiceJob', 'BelongsTo', 'injbJobId', 'Job');
    });
    test('InvoiceJob belongsTo Invoice via injbInvId', () => {
        assertAssoc('InvoiceJob', 'BelongsTo', 'injbInvId', 'Invoice');
    });
    test('ProductEntry belongsTo Job via pentJobId', () => {
        assertAssoc('ProductEntry', 'BelongsTo', 'pentJobId', 'Job');
    });
});

describe('association graph: Invoice payments + balance-forward', () => {
    test('CustomerPayment belongsTo Invoice via cpayInvId', () => {
        assertAssoc('CustomerPayment', 'BelongsTo', 'cpayInvId', 'Invoice');
    });
    test('Invoice hasMany CustomerPayment via cpayInvId', () => {
        assertAssoc('Invoice', 'HasMany', 'cpayInvId', 'CustomerPayment');
    });
    test('Invoice belongsTo Invoice via invBalanceForwardFrom', () => {
        assertAssoc('Invoice', 'BelongsTo', 'invBalanceForwardFrom', 'Invoice');
    });
});

describe('association graph: InventoryItem fan-in', () => {
    test('ProductEntry belongsTo InventoryItem via pentInvtId', () => {
        assertAssoc('ProductEntry', 'BelongsTo', 'pentInvtId', 'InventoryItem');
    });
    test('InventoryTransaction belongsTo InventoryItem via invtInitId', () => {
        assertAssoc('InventoryTransaction', 'BelongsTo', 'invtInitId', 'InventoryItem');
    });
    test('PurchaseOrderLine belongsTo InventoryItem via polInvtId', () => {
        assertAssoc('PurchaseOrderLine', 'BelongsTo', 'polInvtId', 'InventoryItem');
    });
});

describe('association graph: PurchaseOrder chain', () => {
    test('PurchaseOrderHeader belongsTo PurchaseOrderVendor via pohPovId', () => {
        assertAssoc('PurchaseOrderHeader', 'BelongsTo', 'pohPovId', 'PurchaseOrderVendor');
    });
    // The line→header FK is named "polpoh" — lowercase, no separator —
    // a name that comes from the original BACPAC. We mirror it.
    test('PurchaseOrderLine belongsTo PurchaseOrderHeader via polpoh', () => {
        assertAssoc('PurchaseOrderLine', 'BelongsTo', 'polpoh', 'PurchaseOrderHeader');
    });
});

describe('association graph: Worker.defaultBillingType', () => {
    test('Worker belongsTo BillingType via workerDefaultBillType', () => {
        assertAssoc('Worker', 'BelongsTo', 'workerDefaultBillType', 'BillingType');
    });
});

describe('association graph: TimeEntry restored relationships', () => {
    test.each([
        ['Job',         'teJobId'],
        ['Worker',      'teWorkerId'],
        ['BillingType', 'teBillTypeId'],
    ])('TimeEntry belongsTo %s via %s', (target, fk) => {
        assertAssoc('TimeEntry', 'BelongsTo', fk, target);
    });

    test.each([
        ['Job',         'teJobId'],
        ['Worker',      'teWorkerId'],
        ['BillingType', 'teBillTypeId'],
    ])('%s hasMany TimeEntry via %s', (owner, fk) => {
        assertAssoc(owner, 'HasMany', fk, 'TimeEntry');
    });
});
