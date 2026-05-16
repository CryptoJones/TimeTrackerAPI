// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
const express = require('express');
const router = express.Router();

const customer = require('../controllers/customercontroller.js');
const health = require('../controllers/healthcontroller.js');

// Health / readiness probe. No auth required — only exposes liveness
// of the API process and reachability of the database.
router.get('/healthz', health.healthz);

// v1 routes.
router.get('/v1/customer/:id', customer.getCustomerById);
router.get('/v1/customer/bycompany/:id', customer.getAllByCompanyId);
router.post('/v1/customer', customer.createCustomer);

module.exports = router;
