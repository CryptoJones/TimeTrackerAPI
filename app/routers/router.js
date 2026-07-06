// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
const express = require('express');
const router = express.Router();

const swaggerUi = require('swagger-ui-express');
const { attachAuth, attachUser } = require('../middleware/auth.js');
const { idempotency } = require('../middleware/idempotency.js');
const { metricsHandler } = require('../middleware/metrics.js');
const { auditLog } = require('../middleware/audit.js');

const customer = require('../controllers/customercontroller.js');
const health = require('../controllers/healthcontroller.js');
const timeEntry = require('../controllers/timeentrycontroller.js');
const worker = require('../controllers/workercontroller.js');
const billingType = require('../controllers/billingtypecontroller.js');
const inventoryItem = require('../controllers/inventoryitemcontroller.js');
const company = require('../controllers/companycontroller.js');
const job = require('../controllers/jobcontroller.js');
const invoice = require('../controllers/invoicecontroller.js');
const customerPayment = require('../controllers/customerpaymentcontroller.js');
const invoiceJob = require('../controllers/invoicejobcontroller.js');
const productEntry = require('../controllers/productentrycontroller.js');
const versionInfo = require('../controllers/versioninfocontroller.js');
const purchaseOrderVendor = require('../controllers/purchaseordervendorcontroller.js');
const purchaseOrderHeader = require('../controllers/purchaseorderheadercontroller.js');
const purchaseOrderLine = require('../controllers/purchaseorderlinecontroller.js');
const inventoryTransaction = require('../controllers/inventorytransactioncontroller.js');
const whoami = require('../controllers/whoamicontroller.js');
const report = require('../controllers/reportcontroller.js');
const expense = require('../controllers/expensecontroller.js');
const auditlog = require('../controllers/auditlogcontroller.js');
const task = require('../controllers/taskcontroller.js');
const retainer = require('../controllers/retainercontroller.js');
const phase = require('../controllers/phasecontroller.js');
const role = require('../controllers/rolecontroller.js');
const recurringInvoice = require('../controllers/recurringinvoicecontroller.js');
const apikey = require('../controllers/apikeycontroller.js');
const webhook = require('../controllers/webhookcontroller.js');
const notification = require('../controllers/notificationcontroller.js');
const rateSchedule = require('../controllers/rateschedulecontroller.js');
const user = require('../controllers/usercontroller.js');
const authController = require('../controllers/authcontroller.js');
const receipt = require('../controllers/receiptcontroller.js');
const reportSchedule = require('../controllers/reportschedulecontroller.js');
const gdpr = require('../controllers/gdprcontroller.js');
const payroll = require('../controllers/payrollcontroller.js');
const share = require('../controllers/sharecontroller.js');
const approvalChain = require('../controllers/approvalchaincontroller.js');
const invitation = require('../controllers/invitationcontroller.js');
const capacity = require('../controllers/capacitycontroller.js');
const customField = require('../controllers/customfielddefcontroller.js');
const billableRule = require('../controllers/billablerulecontroller.js');
const openapiSpec = require('../config/openapi.js');
const v = require('../middleware/validate.js');
const customerSchemas = require('../schemas/customer.schema.js');
const timeEntrySchemas = require('../schemas/timeentry.schema.js');
const workerSchemas = require('../schemas/worker.schema.js');
const billingTypeSchemas = require('../schemas/billingtype.schema.js');
const inventoryItemSchemas = require('../schemas/inventoryitem.schema.js');
const companySchemas = require('../schemas/company.schema.js');
const jobSchemas = require('../schemas/job.schema.js');
const invoiceSchemas = require('../schemas/invoice.schema.js');
const customerPaymentSchemas = require('../schemas/customerpayment.schema.js');
const invoiceJobSchemas = require('../schemas/invoicejob.schema.js');
const productEntrySchemas = require('../schemas/productentry.schema.js');
const versionInfoSchemas = require('../schemas/versioninfo.schema.js');
const purchaseOrderVendorSchemas = require('../schemas/purchaseordervendor.schema.js');
const purchaseOrderHeaderSchemas = require('../schemas/purchaseorderheader.schema.js');
const purchaseOrderLineSchemas = require('../schemas/purchaseorderline.schema.js');
const reportSchemas = require('../schemas/report.schema.js');
const expenseSchemas = require('../schemas/expense.schema.js');
const auditlogSchemas = require('../schemas/auditlog.schema.js');
const taskSchemas = require('../schemas/task.schema.js');
const retainerSchemas = require('../schemas/retainer.schema.js');
const phaseSchemas = require('../schemas/phase.schema.js');
const roleSchemas = require('../schemas/role.schema.js');
const recurringInvoiceSchemas = require('../schemas/recurringinvoice.schema.js');
const apiKeySchemas = require('../schemas/apikey.schema.js');
const webhookSchemas = require('../schemas/webhook.schema.js');
const notificationSchemas = require('../schemas/notification.schema.js');
const rateScheduleSchemas = require('../schemas/rateschedule.schema.js');
const userSchemas = require('../schemas/user.schema.js');
const authSchemas = require('../schemas/auth.schema.js');
const receiptSchemas = require('../schemas/receipt.schema.js');
const reportScheduleSchemas = require('../schemas/reportschedule.schema.js');
const gdprSchemas = require('../schemas/gdpr.schema.js');
const payrollSchemas = require('../schemas/payroll.schema.js');
const shareSchemas = require('../schemas/share.schema.js');
const approvalChainSchemas = require('../schemas/approvalchain.schema.js');
const invitationSchemas = require('../schemas/invitation.schema.js');
const capacitySchemas = require('../schemas/capacity.schema.js');
const customFieldSchemas = require('../schemas/customfielddef.schema.js');
const billableRuleSchemas = require('../schemas/billablerule.schema.js');
const inventoryTransactionSchemas = require('../schemas/inventorytransaction.schema.js');

// Health / readiness probe. No auth required — only exposes liveness
// of the API process and reachability of the database.
router.get('/healthz', health.healthz);

// Prometheus scrape endpoint. Auth is optional, gated by
// METRICS_BEARER_TOKEN env var; unset => unauthenticated, the
// usual private-network deployment pattern.
router.get('/metrics', metricsHandler);

// attachAuth runs on every /v1/* request and populates
// req.authKey / req.isMaster / req.companyId without rejecting.
// Existing controllers still have their inline authKey check; once
// they migrate to read req.isMaster / req.companyId, the inline
// check becomes redundant and requireAuth can be mounted globally.
// Until then we keep mounting requireAuth opt-in (currently only
// used to fence /v1/whoami's downstream peers via per-controller
// adoption in follow-up PRs).
router.use('/v1', attachAuth);

// attachUser resolves a Bearer JWT into req.user (the RBAC actor), parallel
// to attachAuth's API-key context. Best-effort, never rejects — handlers that
// enforce RBAC (user/invitation management) read req.user when a signed-in
// user is acting; an API key stays the tenant's full-authority credential.
router.use('/v1', attachUser);

// Idempotency-Key support for POSTs. The middleware is a no-op
// for non-POST methods and for POSTs that don't send the header;
// it only kicks in when a client opts in by setting the header. We
// mount it AFTER attachAuth so the cache scope can be hashed
// together with the calling auth key (avoids cross-tenant collisions
// for clients that happen to pick the same Idempotency-Key value).
router.use('/v1', (req, res, next) => {
    if (req.method !== 'POST') return next();
    // idempotency is async; route any unexpected rejection to the error
    // handler (→ 500) rather than letting it become an unhandled rejection
    // that could crash the process (there is no process-level
    // unhandledRejection net). The known deep-body case is already handled
    // inside as a 400; this is defense-in-depth for every other path.
    return Promise.resolve(idempotency(req, res, next)).catch(next);
});

// Audit trail (#460): record successful mutations after the response is
// sent. Fire-and-forget; never blocks or breaks a request. Mounted after
// attachAuth so req.isMaster / req.companyId are populated.
router.use('/v1', auditLog);

// Identity probe — returns what the calling authKey resolves to.
// Distinguishes "header missing" (403) from "header present but
// unknown" (200 with authenticated:false) so a strict guard
// middleware here would collapse useful signal.
router.get('/v1/whoami', whoami.whoami);

// OpenAPI: machine-readable spec at /openapi.json, interactive
// Swagger UI at /docs. Both are unauthenticated by design — the
// spec is the public contract, not a secret.
router.get('/openapi.json', (req, res) => res.json(openapiSpec));
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'TimeTrackerAPI · Swagger',
    swaggerOptions: {
        // Keep the authKey across page reloads so a "Try it out" flow
        // doesn't lose the header on every refresh.
        persistAuthorization: true,
        // Path filter box — the API has ~50 path entries across 16
        // entities, so a free-text filter ("invoice", "bulk", …) is
        // a meaningful navigation aid for operators using /docs in
        // a browser.
        filter: true,
        // Surface "Try it out" round-trip duration so latency-sensitive
        // changes get a quick eyeball check without opening devtools.
        displayRequestDuration: true,
    },
}));

// v1 customer routes.
// /search MUST be declared before /:id so express doesn't treat
// "search" as an :id param (which intIdParam would 400 on).
router.get(
    '/v1/customer/search',
    v.query(customerSchemas.searchQuery),
    customer.search,
);
router.get(
    '/v1/customer/export.csv',
    v.query(customerSchemas.exportCsvQuery),
    customer.exportCsv,
);
router.post(
    '/v1/customer/bulk',
    v.body(customerSchemas.bulkCustomerBody),
    customer.bulkCreate,
);
router.get(
    '/v1/customer/:id',
    v.params(customerSchemas.intIdParam),
    customer.getCustomerById,
);
router.get(
    '/v1/customer/bycompany/:id',
    v.params(customerSchemas.intIdParam),
    v.query(customerSchemas.listByCompanyQuery),
    customer.getAllByCompanyId,
);
router.post(
    '/v1/customer',
    v.body(customerSchemas.createCustomerBody),
    customer.createCustomer,
);

// v1 time-entry routes.
router.post(
    '/v1/timeentry',
    v.body(timeEntrySchemas.createTimeEntryBody),
    timeEntry.create,
);
// Bulk import (#379): create many entries in one call, per-row results.
router.post(
    '/v1/timeentry/bulk',
    v.body(timeEntrySchemas.bulkTimeEntryBody),
    timeEntry.bulk,
);
// Timer capture (#396): start begins an in-flight entry, stop closes it.
router.post(
    '/v1/timeentry/start',
    v.body(timeEntrySchemas.startTimerBody),
    timeEntry.start,
);
router.post(
    '/v1/timeentry/:id/stop',
    v.params(timeEntrySchemas.intIdParam),
    timeEntry.stop,
);
// Timesheet approval workflow (#440): submit / approve / reject.
router.post(
    '/v1/timeentry/:id/approval',
    v.params(timeEntrySchemas.intIdParam),
    v.body(timeEntrySchemas.approvalBody),
    timeEntry.approval,
);
// Copy-previous (#399): clone an entry's metadata into a fresh entry.
router.post(
    '/v1/timeentry/:id/copy',
    v.params(timeEntrySchemas.intIdParam),
    v.body(timeEntrySchemas.copyTimeEntryBody),
    timeEntry.copy,
);
// Approval reminders (#442): email a digest of stale pending approvals.
router.post(
    '/v1/timeentry/approval-reminders',
    v.body(timeEntrySchemas.approvalRemindersBody),
    timeEntry.approvalReminders,
);
// Literal paths declared BEFORE /:id so express doesn't try to
// parse "export.csv" / "bycompany" as a customer id.
router.get(
    '/v1/timeentry/export.csv',
    v.query(timeEntrySchemas.exportCsvQuery),
    timeEntry.exportCsv,
);
router.get(
    '/v1/timeentry/bycompany/:id',
    v.params(timeEntrySchemas.intIdParam),
    v.query(timeEntrySchemas.listByCompanyQuery),
    timeEntry.listByCompany,
);
router.get(
    '/v1/timeentry/:id',
    v.params(timeEntrySchemas.intIdParam),
    timeEntry.getById,
);
router.patch(
    '/v1/timeentry/:id',
    v.params(timeEntrySchemas.intIdParam),
    v.body(timeEntrySchemas.updateTimeEntryBody),
    timeEntry.update,
);
router.delete(
    '/v1/timeentry/:id',
    v.params(timeEntrySchemas.intIdParam),
    timeEntry.remove,
);

// v1 worker routes.
//
// /bulk goes BEFORE /:id-bearing routes so Express's matcher doesn't
// route the literal "bulk" segment through the :id-typed validator.
// (Same trick as /v1/customer/bulk and /v1/customer/export.csv.)
router.post(
    '/v1/worker/bulk',
    v.body(workerSchemas.bulkWorkerBody),
    worker.bulkCreate,
);
router.post(
    '/v1/worker',
    v.body(workerSchemas.createWorkerBody),
    worker.create,
);
router.get(
    '/v1/worker/bycompany/:id',
    v.params(workerSchemas.intIdParam),
    v.query(workerSchemas.listByCompanyQuery),
    worker.listByCompany,
);
router.get(
    '/v1/worker/:id',
    v.params(workerSchemas.intIdParam),
    worker.getById,
);
// A worker's own time entries (#397) — handled by the timeentry
// controller since it owns the TimeEntry model + list helpers.
router.get(
    '/v1/worker/:id/timeentries',
    v.params(workerSchemas.intIdParam),
    v.query(timeEntrySchemas.listByCompanyQuery),
    timeEntry.listByWorker,
);
router.patch(
    '/v1/worker/:id',
    v.params(workerSchemas.intIdParam),
    v.body(workerSchemas.updateWorkerBody),
    worker.update,
);
router.delete(
    '/v1/worker/:id',
    v.params(workerSchemas.intIdParam),
    worker.remove,
);

// v1 billingtype routes.
router.post(
    '/v1/billingtype/bulk',
    v.body(billingTypeSchemas.bulkBillingTypeBody),
    billingType.bulkCreate,
);
router.post(
    '/v1/billingtype',
    v.body(billingTypeSchemas.createBillingTypeBody),
    billingType.create,
);
router.get(
    '/v1/billingtype/bycompany/:id',
    v.params(billingTypeSchemas.intIdParam),
    v.query(billingTypeSchemas.listByCompanyQuery),
    billingType.listByCompany,
);
router.get(
    '/v1/billingtype/:id',
    v.params(billingTypeSchemas.intIdParam),
    billingType.getById,
);
router.patch(
    '/v1/billingtype/:id',
    v.params(billingTypeSchemas.intIdParam),
    v.body(billingTypeSchemas.updateBillingTypeBody),
    billingType.update,
);
router.delete(
    '/v1/billingtype/:id',
    v.params(billingTypeSchemas.intIdParam),
    billingType.remove,
);

// v1 inventoryitem routes.
router.post(
    '/v1/inventoryitem/bulk',
    v.body(inventoryItemSchemas.bulkInventoryItemBody),
    inventoryItem.bulkCreate,
);
router.post(
    '/v1/inventoryitem',
    v.body(inventoryItemSchemas.createInventoryItemBody),
    inventoryItem.create,
);
router.get(
    '/v1/inventoryitem/bycompany/:id',
    v.params(inventoryItemSchemas.intIdParam),
    v.query(inventoryItemSchemas.listByCompanyQuery),
    inventoryItem.listByCompany,
);
router.get(
    '/v1/inventoryitem/:id',
    v.params(inventoryItemSchemas.intIdParam),
    inventoryItem.getById,
);
router.patch(
    '/v1/inventoryitem/:id',
    v.params(inventoryItemSchemas.intIdParam),
    v.body(inventoryItemSchemas.updateInventoryItemBody),
    inventoryItem.update,
);
router.delete(
    '/v1/inventoryitem/:id',
    v.params(inventoryItemSchemas.intIdParam),
    inventoryItem.remove,
);

// v1 company routes. Company is special — see companycontroller.js.
router.post(
    '/v1/company',
    v.body(companySchemas.createCompanyBody),
    company.create,
);
router.get(
    '/v1/company',
    v.query(companySchemas.listQuery),
    company.list,
);
router.get(
    '/v1/company/:id',
    v.params(companySchemas.intIdParam),
    company.getById,
);
router.patch(
    '/v1/company/:id',
    v.params(companySchemas.intIdParam),
    v.body(companySchemas.updateCompanyBody),
    company.update,
);
router.delete(
    '/v1/company/:id',
    v.params(companySchemas.intIdParam),
    company.remove,
);

// v1 job routes. Customer-scoped via jobCustId → Customer.custCompId.
router.post(
    '/v1/job/bulk',
    v.body(jobSchemas.bulkJobBody),
    job.bulkCreate,
);
router.post(
    '/v1/job',
    v.body(jobSchemas.createJobBody),
    job.create,
);
router.get(
    '/v1/job/bycustomer/:id',
    v.params(jobSchemas.intIdParam),
    v.query(jobSchemas.listByCustomerQuery),
    job.listByCustomer,
);
router.get(
    '/v1/job/:id',
    v.params(jobSchemas.intIdParam),
    job.getById,
);
router.patch(
    '/v1/job/:id',
    v.params(jobSchemas.intIdParam),
    v.body(jobSchemas.updateJobBody),
    job.update,
);
router.delete(
    '/v1/job/:id',
    v.params(jobSchemas.intIdParam),
    job.remove,
);

// v1 invoice routes.
router.post(
    '/v1/invoice/bulk',
    v.body(invoiceSchemas.bulkInvoiceBody),
    invoice.bulkCreate,
);
router.post(
    '/v1/invoice',
    v.body(invoiceSchemas.createInvoiceBody),
    invoice.create,
);
router.post(
    '/v1/invoice/rollup',
    v.body(invoiceSchemas.rollupInvoiceBody),
    invoice.rollup,
);
// Payment reminders / dunning (#10): email a digest of overdue invoices.
router.post(
    '/v1/invoice/payment-reminders',
    v.body(invoiceSchemas.paymentRemindersBody),
    invoice.paymentReminders,
);
// Milestone billing (#428): generate an invoice for a phase's budget.
router.post(
    '/v1/invoice/from-phase',
    v.body(invoiceSchemas.fromPhaseBody),
    invoice.fromPhase,
);
router.get(
    '/v1/invoice/aging',
    v.query(invoiceSchemas.agingQuery),
    invoice.aging,
);
router.get(
    '/v1/invoice/bycustomer/:id',
    v.params(invoiceSchemas.intIdParam),
    v.query(invoiceSchemas.listByCustomerQuery),
    invoice.listByCustomer,
);
router.get(
    '/v1/invoice/:id',
    v.params(invoiceSchemas.intIdParam),
    invoice.getById,
);
router.get(
    '/v1/invoice/:id/pdf',
    v.params(invoiceSchemas.intIdParam),
    v.query(invoiceSchemas.pdfQuery),
    invoice.pdf,
);
router.patch(
    '/v1/invoice/:id',
    v.params(invoiceSchemas.intIdParam),
    v.body(invoiceSchemas.updateInvoiceBody),
    invoice.update,
);
router.delete(
    '/v1/invoice/:id',
    v.params(invoiceSchemas.intIdParam),
    invoice.remove,
);

// v1 customerpayment routes.
router.post(
    '/v1/customerpayment/bulk',
    v.body(customerPaymentSchemas.bulkCustomerPaymentBody),
    customerPayment.bulkCreate,
);
router.post(
    '/v1/customerpayment',
    v.body(customerPaymentSchemas.createCustomerPaymentBody),
    customerPayment.create,
);
router.get(
    '/v1/customerpayment/bycustomer/:id',
    v.params(customerPaymentSchemas.intIdParam),
    v.query(customerPaymentSchemas.listByCustomerQuery),
    customerPayment.listByCustomer,
);
router.get(
    '/v1/customerpayment/:id',
    v.params(customerPaymentSchemas.intIdParam),
    customerPayment.getById,
);
router.patch(
    '/v1/customerpayment/:id',
    v.params(customerPaymentSchemas.intIdParam),
    v.body(customerPaymentSchemas.updateCustomerPaymentBody),
    customerPayment.update,
);
router.delete(
    '/v1/customerpayment/:id',
    v.params(customerPaymentSchemas.intIdParam),
    customerPayment.remove,
);

// v1 invoicejob routes. Job-scoped via injbJobId → Job.jobCustId → Customer.custCompId.
router.post(
    '/v1/invoicejob/bulk',
    v.body(invoiceJobSchemas.bulkInvoiceJobBody),
    invoiceJob.bulkCreate,
);
router.post(
    '/v1/invoicejob',
    v.body(invoiceJobSchemas.createInvoiceJobBody),
    invoiceJob.create,
);
router.get(
    '/v1/invoicejob/byinvoice/:id',
    v.params(invoiceJobSchemas.intIdParam),
    v.query(invoiceJobSchemas.listByInvoiceQuery),
    invoiceJob.listByInvoice,
);
router.get(
    '/v1/invoicejob/:id',
    v.params(invoiceJobSchemas.intIdParam),
    invoiceJob.getById,
);
router.patch(
    '/v1/invoicejob/:id',
    v.params(invoiceJobSchemas.intIdParam),
    v.body(invoiceJobSchemas.updateInvoiceJobBody),
    invoiceJob.update,
);
router.delete(
    '/v1/invoicejob/:id',
    v.params(invoiceJobSchemas.intIdParam),
    invoiceJob.remove,
);

// v1 productentry routes.
router.post(
    '/v1/productentry/bulk',
    v.body(productEntrySchemas.bulkProductEntryBody),
    productEntry.bulkCreate,
);
router.post(
    '/v1/productentry',
    v.body(productEntrySchemas.createProductEntryBody),
    productEntry.create,
);
router.get(
    '/v1/productentry/byjob/:id',
    v.params(productEntrySchemas.intIdParam),
    v.query(productEntrySchemas.listByJobQuery),
    productEntry.listByJob,
);
router.get(
    '/v1/productentry/:id',
    v.params(productEntrySchemas.intIdParam),
    productEntry.getById,
);
router.patch(
    '/v1/productentry/:id',
    v.params(productEntrySchemas.intIdParam),
    v.body(productEntrySchemas.updateProductEntryBody),
    productEntry.update,
);
router.delete(
    '/v1/productentry/:id',
    v.params(productEntrySchemas.intIdParam),
    productEntry.remove,
);

// v1 versioninfo routes. Global table; reads open to any authKey,
// mutations require a master key.
router.post(
    '/v1/versioninfo',
    v.body(versionInfoSchemas.createVersionInfoBody),
    versionInfo.create,
);
router.get(
    '/v1/versioninfo',
    v.query(versionInfoSchemas.listQuery),
    versionInfo.list,
);
router.get(
    '/v1/versioninfo/:id',
    v.params(versionInfoSchemas.intIdParam),
    versionInfo.getById,
);
router.patch(
    '/v1/versioninfo/:id',
    v.params(versionInfoSchemas.intIdParam),
    v.body(versionInfoSchemas.updateVersionInfoBody),
    versionInfo.update,
);
router.delete(
    '/v1/versioninfo/:id',
    v.params(versionInfoSchemas.intIdParam),
    versionInfo.remove,
);

// v1 purchaseordervendor routes. Direct compId scoping via povCompId.
router.post(
    '/v1/purchaseordervendor/bulk',
    v.body(purchaseOrderVendorSchemas.bulkBody),
    purchaseOrderVendor.bulkCreate,
);
router.post(
    '/v1/purchaseordervendor',
    v.body(purchaseOrderVendorSchemas.createBody),
    purchaseOrderVendor.create,
);
router.get(
    '/v1/purchaseordervendor/bycompany/:id',
    v.params(purchaseOrderVendorSchemas.intIdParam),
    v.query(purchaseOrderVendorSchemas.listByCompanyQuery),
    purchaseOrderVendor.listByCompany,
);
router.get(
    '/v1/purchaseordervendor/:id',
    v.params(purchaseOrderVendorSchemas.intIdParam),
    purchaseOrderVendor.getById,
);
router.patch(
    '/v1/purchaseordervendor/:id',
    v.params(purchaseOrderVendorSchemas.intIdParam),
    v.body(purchaseOrderVendorSchemas.updateBody),
    purchaseOrderVendor.update,
);
router.delete(
    '/v1/purchaseordervendor/:id',
    v.params(purchaseOrderVendorSchemas.intIdParam),
    purchaseOrderVendor.remove,
);

// v1 purchaseorderheader routes. Vendor-scoped via pohPovId → povCompId.
router.post(
    '/v1/purchaseorderheader/bulk',
    v.body(purchaseOrderHeaderSchemas.bulkBody),
    purchaseOrderHeader.bulkCreate,
);
router.post(
    '/v1/purchaseorderheader',
    v.body(purchaseOrderHeaderSchemas.createBody),
    purchaseOrderHeader.create,
);
router.get(
    '/v1/purchaseorderheader/byvendor/:id',
    v.params(purchaseOrderHeaderSchemas.intIdParam),
    v.query(purchaseOrderHeaderSchemas.listByVendorQuery),
    purchaseOrderHeader.listByVendor,
);
router.get(
    '/v1/purchaseorderheader/:id',
    v.params(purchaseOrderHeaderSchemas.intIdParam),
    purchaseOrderHeader.getById,
);
router.patch(
    '/v1/purchaseorderheader/:id',
    v.params(purchaseOrderHeaderSchemas.intIdParam),
    v.body(purchaseOrderHeaderSchemas.updateBody),
    purchaseOrderHeader.update,
);
router.delete(
    '/v1/purchaseorderheader/:id',
    v.params(purchaseOrderHeaderSchemas.intIdParam),
    purchaseOrderHeader.remove,
);

// v1 purchaseorderline routes. Header-scoped via polpoh → header → vendor.povCompId.
router.post(
    '/v1/purchaseorderline/bulk',
    v.body(purchaseOrderLineSchemas.bulkBody),
    purchaseOrderLine.bulkCreate,
);
router.post(
    '/v1/purchaseorderline',
    v.body(purchaseOrderLineSchemas.createBody),
    purchaseOrderLine.create,
);
router.get(
    '/v1/purchaseorderline/byheader/:id',
    v.params(purchaseOrderLineSchemas.intIdParam),
    v.query(purchaseOrderLineSchemas.listByHeaderQuery),
    purchaseOrderLine.listByHeader,
);
router.get(
    '/v1/purchaseorderline/:id',
    v.params(purchaseOrderLineSchemas.intIdParam),
    purchaseOrderLine.getById,
);
router.patch(
    '/v1/purchaseorderline/:id',
    v.params(purchaseOrderLineSchemas.intIdParam),
    v.body(purchaseOrderLineSchemas.updateBody),
    purchaseOrderLine.update,
);
router.delete(
    '/v1/purchaseorderline/:id',
    v.params(purchaseOrderLineSchemas.intIdParam),
    purchaseOrderLine.remove,
);

// v1 inventorytransaction routes. Direct compId scoping via invtCompanyId.
router.post(
    '/v1/inventorytransaction/bulk',
    v.body(inventoryTransactionSchemas.bulkBody),
    inventoryTransaction.bulkCreate,
);
router.post(
    '/v1/inventorytransaction',
    v.body(inventoryTransactionSchemas.createBody),
    inventoryTransaction.create,
);
router.get(
    '/v1/inventorytransaction/bycompany/:id',
    v.params(inventoryTransactionSchemas.intIdParam),
    v.query(inventoryTransactionSchemas.listByCompanyQuery),
    inventoryTransaction.listByCompany,
);
router.get(
    '/v1/inventorytransaction/:id',
    v.params(inventoryTransactionSchemas.intIdParam),
    inventoryTransaction.getById,
);
router.patch(
    '/v1/inventorytransaction/:id',
    v.params(inventoryTransactionSchemas.intIdParam),
    v.body(inventoryTransactionSchemas.updateBody),
    inventoryTransaction.update,
);
router.delete(
    '/v1/inventorytransaction/:id',
    v.params(inventoryTransactionSchemas.intIdParam),
    inventoryTransaction.remove,
);

// v1 retainer routes (client prepayments, #426).
router.post(
    '/v1/retainer',
    v.body(retainerSchemas.createRetainerBody),
    retainer.create,
);
router.get(
    '/v1/retainer/bycustomer/:id',
    v.params(retainerSchemas.intIdParam),
    v.query(retainerSchemas.listByCustomerQuery),
    retainer.listByCustomer,
);
router.post(
    '/v1/retainer/:id/drawdown',
    v.params(retainerSchemas.intIdParam),
    v.body(retainerSchemas.drawdownBody),
    retainer.drawdown,
);
router.get(
    '/v1/retainer/:id',
    v.params(retainerSchemas.intIdParam),
    retainer.getById,
);
router.patch(
    '/v1/retainer/:id',
    v.params(retainerSchemas.intIdParam),
    v.body(retainerSchemas.updateRetainerBody),
    retainer.update,
);
router.delete(
    '/v1/retainer/:id',
    v.params(retainerSchemas.intIdParam),
    retainer.remove,
);

// v1 sign-in routes (#445). Public — POST /login issues a JWT for a User;
// GET /me returns the signed-in user. Separate from the API-key auth.
router.post(
    '/v1/login',
    v.body(authSchemas.loginBody),
    authController.login,
);
router.get(
    '/v1/me',
    authController.me,
);
// Password reset (#446): request emails a one-time token; confirm sets a
// new password. Public.
router.post(
    '/v1/password-reset/request',
    v.body(authSchemas.requestResetBody),
    authController.requestReset,
);
router.post(
    '/v1/password-reset/confirm',
    v.body(authSchemas.confirmResetBody),
    authController.confirmReset,
);

// v1 report-schedule routes (scheduled report delivery, #57).
// GET /due is declared before GET /:id so "due" isn't parsed as an id.
router.post(
    '/v1/reportschedule',
    v.body(reportScheduleSchemas.createReportScheduleBody),
    reportSchedule.create,
);
router.get(
    '/v1/reportschedule/due',
    v.query(reportScheduleSchemas.dueQuery),
    reportSchedule.listDue,
);
router.get(
    '/v1/reportschedule/bycompany/:id',
    v.params(reportScheduleSchemas.intIdParam),
    v.query(reportScheduleSchemas.listByCompanyQuery),
    reportSchedule.listByCompany,
);
router.post(
    '/v1/reportschedule/:id/run',
    v.params(reportScheduleSchemas.intIdParam),
    reportSchedule.run,
);
router.get(
    '/v1/reportschedule/:id',
    v.params(reportScheduleSchemas.intIdParam),
    reportSchedule.getById,
);
router.patch(
    '/v1/reportschedule/:id',
    v.params(reportScheduleSchemas.intIdParam),
    v.body(reportScheduleSchemas.updateReportScheduleBody),
    reportSchedule.update,
);
router.delete(
    '/v1/reportschedule/:id',
    v.params(reportScheduleSchemas.intIdParam),
    reportSchedule.remove,
);

// v1 receipt routes (#419). Files attached to expenses; bytes in Postgres.
// GET /:id/download streams the file; /byexpense/:id lists metadata.
router.post(
    '/v1/receipt',
    v.body(receiptSchemas.createReceiptBody),
    receipt.create,
);
router.get(
    '/v1/receipt/byexpense/:id',
    v.params(receiptSchemas.intIdParam),
    v.query(receiptSchemas.listByExpenseQuery),
    receipt.listByExpense,
);
router.get(
    '/v1/receipt/:id/download',
    v.params(receiptSchemas.intIdParam),
    receipt.download,
);
router.get(
    '/v1/receipt/:id',
    v.params(receiptSchemas.intIdParam),
    receipt.getById,
);
router.delete(
    '/v1/receipt/:id',
    v.params(receiptSchemas.intIdParam),
    receipt.remove,
);

// v1 user-account routes (#444). Sign-in users, separate from API keys.
router.post(
    '/v1/user',
    v.body(userSchemas.createUserBody),
    user.create,
);
router.get(
    '/v1/user/bycompany/:id',
    v.params(userSchemas.intIdParam),
    v.query(userSchemas.listByCompanyQuery),
    user.listByCompany,
);
router.get(
    '/v1/user/:id',
    v.params(userSchemas.intIdParam),
    user.getById,
);
router.patch(
    '/v1/user/:id',
    v.params(userSchemas.intIdParam),
    v.body(userSchemas.updateUserBody),
    user.update,
);
router.delete(
    '/v1/user/:id',
    v.params(userSchemas.intIdParam),
    user.remove,
);
// RBAC (#448): a user's role + effective permissions; set a user's role.
router.get(
    '/v1/user/:id/permissions',
    v.params(userSchemas.intIdParam),
    user.permissions,
);
router.patch(
    '/v1/user/:id/role',
    v.params(userSchemas.intIdParam),
    v.body(userSchemas.setRoleBody),
    user.setRole,
);

// v1 GDPR routes (#461): export a customer's data (portability); erase
// scrubs personal data (financial records retained) and archives the row.
router.get(
    '/v1/gdpr/customer/:id/export',
    v.params(gdprSchemas.intIdParam),
    gdpr.exportCustomer,
);
router.post(
    '/v1/gdpr/customer/:id/erase',
    v.params(gdprSchemas.intIdParam),
    gdpr.eraseCustomer,
);

// v1 payroll routes (#456): aggregate completed worker hours over a pay
// period as JSON (summary) or a payroll-ready CSV (export).
router.get(
    '/v1/payroll/summary',
    v.query(payrollSchemas.payrollQuery),
    payroll.summary,
);
router.get(
    '/v1/payroll/export',
    v.query(payrollSchemas.payrollQuery),
    payroll.exportCsv,
);

// v1 shareable-link routes (#438): mint a signed invoice link (tenant-
// scoped); the view is PUBLIC (no authKey) and authorized by the signed
// token alone.
router.post(
    '/v1/share/invoice/:id',
    v.params(shareSchemas.intIdParam),
    v.body(shareSchemas.shareCreateBody),
    share.createInvoiceShare,
);
router.get(
    '/v1/share/invoice',
    v.query(shareSchemas.shareViewQuery),
    share.viewInvoice,
);

// v1 approval-chain routes (multi-level approval routing, #443).
// GET /:id/next resolves the next required level/role.
router.post(
    '/v1/approvalchain',
    v.body(approvalChainSchemas.createApprovalChainBody),
    approvalChain.create,
);
router.get(
    '/v1/approvalchain/bycompany/:id',
    v.params(approvalChainSchemas.intIdParam),
    v.query(approvalChainSchemas.listByCompanyQuery),
    approvalChain.listByCompany,
);
router.get(
    '/v1/approvalchain/:id/next',
    v.params(approvalChainSchemas.intIdParam),
    v.query(approvalChainSchemas.nextQuery),
    approvalChain.next,
);
router.get(
    '/v1/approvalchain/:id',
    v.params(approvalChainSchemas.intIdParam),
    approvalChain.getById,
);
router.patch(
    '/v1/approvalchain/:id',
    v.params(approvalChainSchemas.intIdParam),
    v.body(approvalChainSchemas.updateApprovalChainBody),
    approvalChain.update,
);
router.delete(
    '/v1/approvalchain/:id',
    v.params(approvalChainSchemas.intIdParam),
    approvalChain.remove,
);

// v1 invitation routes (#458): invite a teammate (scoped); accept is
// PUBLIC and provisions a user from the emailed token.
router.post(
    '/v1/invitation',
    v.body(invitationSchemas.createInvitationBody),
    invitation.create,
);
router.post(
    '/v1/invitation/accept',
    v.body(invitationSchemas.acceptInvitationBody),
    invitation.accept,
);
router.get(
    '/v1/invitation/bycompany/:id',
    v.params(invitationSchemas.intIdParam),
    v.query(invitationSchemas.listByCompanyQuery),
    invitation.listByCompany,
);
router.delete(
    '/v1/invitation/:id',
    v.params(invitationSchemas.intIdParam),
    invitation.remove,
);

// v1 capacity route (#459): per-worker target vs logged hours + utilization.
router.get(
    '/v1/capacity/summary',
    v.query(capacitySchemas.capacityQuery),
    capacity.summary,
);

// v1 custom-field routes (#409): typed field definitions + a validator.
router.post(
    '/v1/customfield',
    v.body(customFieldSchemas.createCustomFieldDefBody),
    customField.create,
);
router.post(
    '/v1/customfield/validate',
    v.body(customFieldSchemas.validateBody),
    customField.validate,
);
router.get(
    '/v1/customfield/bycompany/:id',
    v.params(customFieldSchemas.intIdParam),
    v.query(customFieldSchemas.listByCompanyQuery),
    customField.listByCompany,
);
router.get(
    '/v1/customfield/:id',
    v.params(customFieldSchemas.intIdParam),
    customField.getById,
);
router.patch(
    '/v1/customfield/:id',
    v.params(customFieldSchemas.intIdParam),
    v.body(customFieldSchemas.updateCustomFieldDefBody),
    customField.update,
);
router.delete(
    '/v1/customfield/:id',
    v.params(customFieldSchemas.intIdParam),
    customField.remove,
);

// v1 billable-rule routes (#415): classification rules + an evaluator.
router.post(
    '/v1/billablerule',
    v.body(billableRuleSchemas.createBillableRuleBody),
    billableRule.create,
);
router.post(
    '/v1/billablerule/evaluate',
    v.body(billableRuleSchemas.evaluateBody),
    billableRule.evaluate,
);
router.get(
    '/v1/billablerule/bycompany/:id',
    v.params(billableRuleSchemas.intIdParam),
    v.query(billableRuleSchemas.listByCompanyQuery),
    billableRule.listByCompany,
);
router.get(
    '/v1/billablerule/:id',
    v.params(billableRuleSchemas.intIdParam),
    billableRule.getById,
);
router.patch(
    '/v1/billablerule/:id',
    v.params(billableRuleSchemas.intIdParam),
    v.body(billableRuleSchemas.updateBillableRuleBody),
    billableRule.update,
);
router.delete(
    '/v1/billablerule/:id',
    v.params(billableRuleSchemas.intIdParam),
    billableRule.remove,
);

// v1 rate-schedule routes (effective-dated rates, #414).
// GET /resolve is declared before GET /:id so "resolve" isn't parsed as an id.
router.post(
    '/v1/rateschedule',
    v.body(rateScheduleSchemas.createRateScheduleBody),
    rateSchedule.create,
);
router.get(
    '/v1/rateschedule/resolve',
    v.query(rateScheduleSchemas.resolveQuery),
    rateSchedule.resolve,
);
router.get(
    '/v1/rateschedule/bycompany/:id',
    v.params(rateScheduleSchemas.intIdParam),
    v.query(rateScheduleSchemas.listByCompanyQuery),
    rateSchedule.listByCompany,
);
router.get(
    '/v1/rateschedule/:id',
    v.params(rateScheduleSchemas.intIdParam),
    rateSchedule.getById,
);
router.patch(
    '/v1/rateschedule/:id',
    v.params(rateScheduleSchemas.intIdParam),
    v.body(rateScheduleSchemas.updateRateScheduleBody),
    rateSchedule.update,
);
router.delete(
    '/v1/rateschedule/:id',
    v.params(rateScheduleSchemas.intIdParam),
    rateSchedule.remove,
);

// v1 notification route (email service test send, master-only, #68).
router.post(
    '/v1/notification/test',
    v.body(notificationSchemas.testNotificationBody),
    notification.test,
);
// v1 Slack/Teams notification dispatch (#454); capture transport default.
router.post(
    '/v1/notification/dispatch',
    v.body(notificationSchemas.notifyBody),
    notification.dispatch,
);

// v1 webhook routes (outbound event subscriptions, #69).
router.post(
    '/v1/webhook',
    v.body(webhookSchemas.createWebhookBody),
    webhook.create,
);
router.get(
    '/v1/webhook/bycompany/:id',
    v.params(webhookSchemas.intIdParam),
    v.query(webhookSchemas.listByCompanyQuery),
    webhook.listByCompany,
);
router.post(
    '/v1/webhook/:id/ping',
    v.params(webhookSchemas.intIdParam),
    webhook.ping,
);
router.get(
    '/v1/webhook/:id',
    v.params(webhookSchemas.intIdParam),
    webhook.getById,
);
router.patch(
    '/v1/webhook/:id',
    v.params(webhookSchemas.intIdParam),
    v.body(webhookSchemas.updateWebhookBody),
    webhook.update,
);
router.delete(
    '/v1/webhook/:id',
    v.params(webhookSchemas.intIdParam),
    webhook.remove,
);

// v1 api-key lifecycle routes (master-only; provision / rotate / revoke, #65).
router.post(
    '/v1/apikey',
    v.body(apiKeySchemas.createApiKeyBody),
    apikey.create,
);
router.get(
    '/v1/apikey/bycompany/:id',
    v.params(apiKeySchemas.intIdParam),
    v.query(apiKeySchemas.listByCompanyQuery),
    apikey.listByCompany,
);
router.post(
    '/v1/apikey/:id/rotate',
    v.params(apiKeySchemas.intIdParam),
    apikey.rotate,
);
router.get(
    '/v1/apikey/:id',
    v.params(apiKeySchemas.intIdParam),
    apikey.getById,
);
router.delete(
    '/v1/apikey/:id',
    v.params(apiKeySchemas.intIdParam),
    apikey.revoke,
);

// v1 recurring-invoice routes (billing schedules, #425).
// GET /due is declared before GET /:id so "due" isn't parsed as an id.
router.post(
    '/v1/recurringinvoice',
    v.body(recurringInvoiceSchemas.createRecurringInvoiceBody),
    recurringInvoice.create,
);
router.get(
    '/v1/recurringinvoice/due',
    v.query(recurringInvoiceSchemas.dueQuery),
    recurringInvoice.listDue,
);
router.get(
    '/v1/recurringinvoice/bycustomer/:id',
    v.params(recurringInvoiceSchemas.intIdParam),
    v.query(recurringInvoiceSchemas.listByCustomerQuery),
    recurringInvoice.listByCustomer,
);
router.post(
    '/v1/recurringinvoice/:id/run',
    v.params(recurringInvoiceSchemas.intIdParam),
    recurringInvoice.run,
);
router.get(
    '/v1/recurringinvoice/:id',
    v.params(recurringInvoiceSchemas.intIdParam),
    recurringInvoice.getById,
);
router.patch(
    '/v1/recurringinvoice/:id',
    v.params(recurringInvoiceSchemas.intIdParam),
    v.body(recurringInvoiceSchemas.updateRecurringInvoiceBody),
    recurringInvoice.update,
);
router.delete(
    '/v1/recurringinvoice/:id',
    v.params(recurringInvoiceSchemas.intIdParam),
    recurringInvoice.remove,
);

// v1 role routes (role rate cards, #412).
router.post(
    '/v1/role',
    v.body(roleSchemas.createRoleBody),
    role.create,
);
router.get(
    '/v1/role/bycompany/:id',
    v.params(roleSchemas.intIdParam),
    v.query(roleSchemas.listByCompanyQuery),
    role.listByCompany,
);
router.get(
    '/v1/role/:id',
    v.params(roleSchemas.intIdParam),
    role.getById,
);
router.patch(
    '/v1/role/:id',
    v.params(roleSchemas.intIdParam),
    v.body(roleSchemas.updateRoleBody),
    role.update,
);
router.delete(
    '/v1/role/:id',
    v.params(roleSchemas.intIdParam),
    role.remove,
);

// v1 phase routes (date-bounded billing stages under jobs, #408).
router.post(
    '/v1/phase',
    v.body(phaseSchemas.createPhaseBody),
    phase.create,
);
router.get(
    '/v1/phase/byjob/:id',
    v.params(phaseSchemas.intIdParam),
    v.query(phaseSchemas.listByJobQuery),
    phase.listByJob,
);
router.get(
    '/v1/phase/:id',
    v.params(phaseSchemas.intIdParam),
    phase.getById,
);
router.patch(
    '/v1/phase/:id',
    v.params(phaseSchemas.intIdParam),
    v.body(phaseSchemas.updatePhaseBody),
    phase.update,
);
router.delete(
    '/v1/phase/:id',
    v.params(phaseSchemas.intIdParam),
    phase.remove,
);

// v1 task routes (activities under jobs, #407).
router.post(
    '/v1/task',
    v.body(taskSchemas.createTaskBody),
    task.create,
);
router.get(
    '/v1/task/byjob/:id',
    v.params(taskSchemas.intIdParam),
    v.query(taskSchemas.listByJobQuery),
    task.listByJob,
);
router.get(
    '/v1/task/:id',
    v.params(taskSchemas.intIdParam),
    task.getById,
);
router.patch(
    '/v1/task/:id',
    v.params(taskSchemas.intIdParam),
    v.body(taskSchemas.updateTaskBody),
    task.update,
);
router.delete(
    '/v1/task/:id',
    v.params(taskSchemas.intIdParam),
    task.remove,
);

// v1 expense routes.
router.post(
    '/v1/expense',
    v.body(expenseSchemas.createExpenseBody),
    expense.create,
);
router.get(
    '/v1/expense/bycompany/:id',
    v.params(expenseSchemas.intIdParam),
    v.query(expenseSchemas.listByCompanyQuery),
    expense.listByCompany,
);
router.get(
    '/v1/expense/:id',
    v.params(expenseSchemas.intIdParam),
    expense.getById,
);
router.patch(
    '/v1/expense/:id',
    v.params(expenseSchemas.intIdParam),
    v.body(expenseSchemas.updateExpenseBody),
    expense.update,
);
router.delete(
    '/v1/expense/:id',
    v.params(expenseSchemas.intIdParam),
    expense.remove,
);

// v1 audit-log route (compliance, #460).
router.get(
    '/v1/auditlog/bycompany/:id',
    v.params(auditlogSchemas.intIdParam),
    v.query(auditlogSchemas.listQuery),
    auditlog.listByCompany,
);

// v1 report routes (read-only analytics).
router.get(
    '/v1/report/unbilled',
    v.query(reportSchemas.unbilledQuery),
    report.unbilled,
);
router.get(
    '/v1/report/hours',
    v.query(reportSchemas.hoursQuery),
    report.hours,
);
router.get(
    '/v1/report/revenue',
    v.query(reportSchemas.revenueQuery),
    report.revenue,
);
// Export parity beyond CSV (#433): the revenue summary as a PDF.
router.get(
    '/v1/report/revenue.pdf',
    v.query(reportSchemas.revenueQuery),
    report.revenuePdf,
);
router.get(
    '/v1/report/billable-summary',
    v.query(reportSchemas.billableSummaryQuery),
    report.billableSummary,
);
router.get(
    '/v1/report/profitability',
    v.query(reportSchemas.profitabilityQuery),
    report.profitability,
);
router.get(
    '/v1/report/utilization',
    v.query(reportSchemas.utilizationQuery),
    report.utilization,
);
router.get(
    '/v1/report/timesheet',
    v.query(reportSchemas.timesheetQuery),
    report.timesheet,
);
router.get(
    '/v1/report/budget',
    v.query(reportSchemas.budgetQuery),
    report.budget,
);
router.get(
    '/v1/report/targets',
    v.query(reportSchemas.targetsQuery),
    report.targets,
);

module.exports = router;
