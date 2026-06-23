// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

const env = require('./env.js');
const Sequelize = require('sequelize');
const log = require('./logger.js');

// Sequelize's default `logging` is `console.log`, which dumps every
// executed SQL statement — INCLUDING bound parameter values — to
// stdout. In production that means a query like
// `SELECT * FROM "dbo"."ApiKey" WHERE "akKey" = $1` followed by the
// bound array containing the raw authKey lands in the operator's
// log stream alongside our structured JSON output, mixing log
// formats and surfacing secrets that pino's redact paths never see
// (those only know about HTTP header structures, not Sequelize SQL
// strings). Disable by default; let operators opt back in for
// targeted debugging by setting DB_LOG_QUERIES=1, in which case
// queries are routed through pino at debug level (silent at the
// default LOG_LEVEL=info, visible when LOG_LEVEL=debug, and never
// emitted as bare console.log).
const dbQueryLog = process.env.DB_LOG_QUERIES === '1'
    ? (sql, timing) => log.debug({ sql, timing }, 'sequelize query')
    : false;

const sequelize = new Sequelize(env.database, env.username, env.password, {
    host: env.host,
    port: env.port,
    dialect: 'postgres',
    logging: dbQueryLog,
    define: {
        schema: 'dbo',
        // Match the de facto pattern: every model in app/models/
        // already sets `timestamps: true` explicitly (the 20260520
        // migration added `createdAt` / `updatedAt` columns to every
        // domain table + the auth tables, and the model overrides
        // were added at the same time). The previous global default
        // of `false` was misleading because no model honoured it,
        // and a future model that forgot the explicit override would
        // silently skip the timestamps Sequelize otherwise auto-
        // populates. Flip the default so new models inherit the
        // right behaviour without ceremony.
        timestamps: true,
    },
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.Customer = require('../models/customer.model.js')(sequelize, Sequelize);
db.ApiMaster = require('../models/apimaster.model.js')(sequelize, Sequelize);
db.ApiKey = require('../models/apikey.model.js')(sequelize, Sequelize);
db.TimeEntry = require('../models/timeentry.model.js')(sequelize, Sequelize);
db.Worker = require('../models/worker.model.js')(sequelize, Sequelize);
db.BillingType = require('../models/billingtype.model.js')(sequelize, Sequelize);
db.InventoryItem = require('../models/inventoryitem.model.js')(sequelize, Sequelize);
db.Company = require('../models/company.model.js')(sequelize, Sequelize);
db.Job = require('../models/job.model.js')(sequelize, Sequelize);
db.Invoice = require('../models/invoice.model.js')(sequelize, Sequelize);
db.CustomerPayment = require('../models/customerpayment.model.js')(sequelize, Sequelize);
db.InvoiceJob = require('../models/invoicejob.model.js')(sequelize, Sequelize);
db.ProductEntry = require('../models/productentry.model.js')(sequelize, Sequelize);
db.VersionInfo = require('../models/versioninfo.model.js')(sequelize, Sequelize);
db.PurchaseOrderVendor = require('../models/purchaseordervendor.model.js')(sequelize, Sequelize);
db.PurchaseOrderHeader = require('../models/purchaseorderheader.model.js')(sequelize, Sequelize);
db.PurchaseOrderLine = require('../models/purchaseorderline.model.js')(sequelize, Sequelize);
db.InventoryTransaction = require('../models/inventorytransaction.model.js')(sequelize, Sequelize);
db.User = require('../models/user.model.js')(sequelize, Sequelize);

// ----------------------------------------------------------------------
// Associations — centralized so the relationship graph is visible
// in one place rather than scattered across 15 model files.
//
// These are JS-side associations only; they do NOT add FK constraints
// to the live schema. The DDL in setup/TimeTracker.sql + the
// 20260517000000 migration are authoritative for what the database
// physically enforces. Associations here enable Sequelize `include`
// (eager loading) and the auto-generated getter/setter methods, no
// more.
//
// FK column names match the existing schema column names verbatim —
// note that several use unusual casings ("polpoh", "invtInitId",
// "penArch" typo) that we mirror rather than rename.
// ----------------------------------------------------------------------

// Company is the root of the tenancy tree — most entities belongsTo it.
db.Company.hasMany(db.Customer,             { foreignKey: 'custCompId',     as: 'customers' });
db.Company.hasMany(db.Worker,               { foreignKey: 'workerCompId',   as: 'workers' });
db.Company.hasMany(db.BillingType,          { foreignKey: 'btCompId',       as: 'billingTypes' });
db.Company.hasMany(db.InventoryItem,        { foreignKey: 'invitCompId',    as: 'inventoryItems' });
db.Company.hasMany(db.ApiKey,               { foreignKey: 'akCompanyId',    as: 'apiKeys' });
db.Company.hasMany(db.TimeEntry,            { foreignKey: 'teCompId',       as: 'timeEntries' });
db.Company.hasMany(db.PurchaseOrderVendor,  { foreignKey: 'povCompId',      as: 'purchaseOrderVendors' });
db.Company.hasMany(db.InventoryTransaction, { foreignKey: 'invtCompanyId',  as: 'inventoryTransactions' });
db.Company.hasMany(db.User,                 { foreignKey: 'usrCompId',      as: 'users' });
db.User.belongsTo(db.Company,               { foreignKey: 'usrCompId',      as: 'company' });

db.Customer.belongsTo(db.Company,           { foreignKey: 'custCompId',     as: 'company' });
db.Worker.belongsTo(db.Company,             { foreignKey: 'workerCompId',   as: 'company' });
db.BillingType.belongsTo(db.Company,        { foreignKey: 'btCompId',       as: 'company' });
db.InventoryItem.belongsTo(db.Company,      { foreignKey: 'invitCompId',    as: 'company' });
db.ApiKey.belongsTo(db.Company,             { foreignKey: 'akCompanyId',    as: 'company' });
db.TimeEntry.belongsTo(db.Company,          { foreignKey: 'teCompId',       as: 'company' });
db.PurchaseOrderVendor.belongsTo(db.Company,{ foreignKey: 'povCompId',      as: 'company' });
db.InventoryTransaction.belongsTo(db.Company,{ foreignKey: 'invtCompanyId', as: 'company' });

// Customer fans out to job-like and ledger entities.
db.Customer.hasMany(db.TimeEntry,        { foreignKey: 'teCustId',   as: 'timeEntries' });
db.Customer.hasMany(db.Job,              { foreignKey: 'jobCustId',  as: 'jobs' });
db.Customer.hasMany(db.Invoice,          { foreignKey: 'invCustId',  as: 'invoices' });
db.Customer.hasMany(db.CustomerPayment,  { foreignKey: 'cpayCustId', as: 'payments' });

db.TimeEntry.belongsTo(db.Customer,       { foreignKey: 'teCustId',   as: 'customer' });
db.Job.belongsTo(db.Customer,             { foreignKey: 'jobCustId',  as: 'customer' });
db.Invoice.belongsTo(db.Customer,         { foreignKey: 'invCustId',  as: 'customer' });
db.CustomerPayment.belongsTo(db.Customer, { foreignKey: 'cpayCustId', as: 'customer' });

// Worker → BillingType (default rate).
db.BillingType.hasMany(db.Worker,    { foreignKey: 'workerDefaultBillType', as: 'workersWithDefault' });
db.Worker.belongsTo(db.BillingType,  { foreignKey: 'workerDefaultBillType', as: 'defaultBillingType' });

// TimeEntry → Job / Worker / BillingType. Restored from the original
// TimerEntries table: time is logged against a job, by a worker, at a
// billing rate — the bridge that reconnects time to the
// Job → InvoiceJob → Invoice chain. All three FKs are nullable.
db.Job.hasMany(db.TimeEntry,         { foreignKey: 'teJobId',      as: 'timeEntries' });
db.TimeEntry.belongsTo(db.Job,       { foreignKey: 'teJobId',      as: 'job' });
db.Worker.hasMany(db.TimeEntry,      { foreignKey: 'teWorkerId',   as: 'timeEntries' });
db.TimeEntry.belongsTo(db.Worker,    { foreignKey: 'teWorkerId',   as: 'worker' });
db.BillingType.hasMany(db.TimeEntry, { foreignKey: 'teBillTypeId', as: 'timeEntries' });
db.TimeEntry.belongsTo(db.BillingType, { foreignKey: 'teBillTypeId', as: 'billingType' });

// Job has lines (InvoiceJob) and product entries.
db.Job.hasMany(db.InvoiceJob,      { foreignKey: 'injbJobId', as: 'invoiceLines' });
db.Job.hasMany(db.ProductEntry,    { foreignKey: 'pentJobId', as: 'productEntries' });
db.InvoiceJob.belongsTo(db.Job,    { foreignKey: 'injbJobId', as: 'job' });
db.ProductEntry.belongsTo(db.Job,  { foreignKey: 'pentJobId', as: 'job' });

// Invoice has its line items.
db.Invoice.hasMany(db.InvoiceJob,  { foreignKey: 'injbInvId', as: 'lines' });
db.InvoiceJob.belongsTo(db.Invoice,{ foreignKey: 'injbInvId', as: 'invoice' });

// Invoice <- payments (a payment may apply to a specific invoice), and the
// balance-forward self-reference linking a carried invoice to its predecessor.
db.Invoice.hasMany(db.CustomerPayment,   { foreignKey: 'cpayInvId', as: 'payments' });
db.CustomerPayment.belongsTo(db.Invoice, { foreignKey: 'cpayInvId', as: 'invoice' });
db.Invoice.belongsTo(db.Invoice,         { foreignKey: 'invBalanceForwardFrom', as: 'balanceForwardFrom' });

// A billed time entry links to the invoice line that consumed it.
db.InvoiceJob.hasMany(db.TimeEntry,   { foreignKey: 'teInvoiceJobId', as: 'timeEntries' });
db.TimeEntry.belongsTo(db.InvoiceJob, { foreignKey: 'teInvoiceJobId', as: 'invoiceLine' });

// InventoryItem is referenced by product entries, inventory
// transactions, and PO lines.
db.InventoryItem.hasMany(db.ProductEntry,         { foreignKey: 'pentInvtId',  as: 'productEntries' });
db.InventoryItem.hasMany(db.InventoryTransaction, { foreignKey: 'invtInitId',  as: 'transactions' });
db.InventoryItem.hasMany(db.PurchaseOrderLine,    { foreignKey: 'polInvtId',   as: 'purchaseOrderLines' });
db.ProductEntry.belongsTo(db.InventoryItem,       { foreignKey: 'pentInvtId',  as: 'inventoryItem' });
db.InventoryTransaction.belongsTo(db.InventoryItem,{ foreignKey: 'invtInitId', as: 'inventoryItem' });
db.PurchaseOrderLine.belongsTo(db.InventoryItem,  { foreignKey: 'polInvtId',   as: 'inventoryItem' });

// PurchaseOrder chain: Vendor → Header → Line.
db.PurchaseOrderVendor.hasMany(db.PurchaseOrderHeader, { foreignKey: 'pohPovId', as: 'purchaseOrders' });
db.PurchaseOrderHeader.belongsTo(db.PurchaseOrderVendor,{ foreignKey: 'pohPovId', as: 'vendor' });
db.PurchaseOrderHeader.hasMany(db.PurchaseOrderLine,   { foreignKey: 'polpoh',   as: 'lines' });
db.PurchaseOrderLine.belongsTo(db.PurchaseOrderHeader, { foreignKey: 'polpoh',   as: 'header' });

module.exports = db;
