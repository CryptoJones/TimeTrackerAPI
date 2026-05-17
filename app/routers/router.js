// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
const express = require('express');
const router = express.Router();

const swaggerUi = require('swagger-ui-express');

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

// Health / readiness probe. No auth required — only exposes liveness
// of the API process and reachability of the database.
router.get('/healthz', health.healthz);

// OpenAPI: machine-readable spec at /openapi.json, interactive
// Swagger UI at /docs. Both are unauthenticated by design — the
// spec is the public contract, not a secret.
router.get('/openapi.json', (req, res) => res.json(openapiSpec));
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'TimeTrackerAPI · Swagger',
    swaggerOptions: { persistAuthorization: true },
}));

// v1 customer routes.
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
    '/v1/invoice',
    v.body(invoiceSchemas.createInvoiceBody),
    invoice.create,
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

module.exports = router;
