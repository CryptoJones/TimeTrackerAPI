// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
const express = require('express');
const router = express.Router();

const swaggerUi = require('swagger-ui-express');

const customer = require('../controllers/customercontroller.js');
const health = require('../controllers/healthcontroller.js');
const timeEntry = require('../controllers/timeentrycontroller.js');
const openapiSpec = require('../config/openapi.js');
const v = require('../middleware/validate.js');
const customerSchemas = require('../schemas/customer.schema.js');
const timeEntrySchemas = require('../schemas/timeentry.schema.js');

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

module.exports = router;
