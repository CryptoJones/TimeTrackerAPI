// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const db = require('./app/config/db.config.js');
const router = require('./app/routers/router.js');

const app = express();

// CORS — env-configurable. Accept a single origin or a comma-separated
// list. Default to no cross-origin access; operators must opt in by
// setting CORS_ORIGIN explicitly.
const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : false;

app.use(cors({
    origin: corsOrigin,
    optionsSuccessStatus: 200,
}));

app.use(bodyParser.json());
app.use('/', router);

// Listen port — env-configurable. Defaults to 3000 so the API can be
// started by a non-root user. Bind to 0.0.0.0 for container friendliness.
const port = parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
    const addr = server.address();
    console.log(`Server is listening at http://${addr.address}:${addr.port}`);
});
