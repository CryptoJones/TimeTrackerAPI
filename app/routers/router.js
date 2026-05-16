// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
const express = require('express');
const router = express.Router();

const customer = require('../controllers/customercontroller.js');
const health = require('../controllers/healthcontroller.js');
const timeEntry = require('../controllers/timeentrycontroller.js');

// Health / readiness probe. No auth required — only exposes liveness
// of the API process and reachability of the database.
router.get('/healthz', health.healthz);

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
