// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
const express = require('express');
const router = express.Router();

const swaggerUi = require('swagger-ui-express');

const customer = require('../controllers/customercontroller.js');
const health = require('../controllers/healthcontroller.js');
const timeEntry = require('../controllers/timeentrycontroller.js');
const openapiSpec = require('../config/openapi.js');

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
router.get('/v1/customer/:id', customer.getCustomerById);
router.get('/v1/customer/bycompany/:id', customer.getAllByCompanyId);
router.post('/v1/customer', customer.createCustomer);

// v1 time-entry routes.
router.post('/v1/timeentry', timeEntry.create);
router.get('/v1/timeentry/bycompany/:id', timeEntry.listByCompany);
router.get('/v1/timeentry/:id', timeEntry.getById);
router.patch('/v1/timeentry/:id', timeEntry.update);
router.delete('/v1/timeentry/:id', timeEntry.remove);

module.exports = router;
