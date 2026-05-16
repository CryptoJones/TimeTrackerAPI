// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');

const db = require('./app/config/db.config.js');
const log = require('./app/config/logger.js');
const router = require('./app/routers/router.js');

const app = express();

// Structured request logging (pino-http). One JSON line per request
// with method, path, status, response time, and the per-request
// child logger available as req.log inside controllers.
// Healthz probes are quieted to `silent` to avoid drowning the log
// stream — orchestrator probes hit it on tight intervals and noisy
// success-rows for them are pure noise.
app.use(pinoHttp({
    logger: log,
    customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        if (req.url === '/healthz') return 'silent';
        return 'info';
    },
    autoLogging: { ignore: () => false },
    serializers: {
        req: (req) => ({
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
            // headers intentionally omitted — see logger.js redact paths
            // for the authKey defense-in-depth.
        }),
    },
}));

// Trust proxy headers when running behind nginx/caddy/cloudflare so
// rate-limit keys on the real client IP instead of the proxy IP.
// Operators opt in via TRUST_PROXY (true|false|<hop count>). Default
// false to avoid the security pitfall of trusting X-Forwarded-For
// from a non-proxied client.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === 'true') {
    app.set('trust proxy', true);
} else if (trustProxy && !isNaN(parseInt(trustProxy, 10))) {
    app.set('trust proxy', parseInt(trustProxy, 10));
}

// Security headers via helmet. Defaults are sensible for an API:
// X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// Strict-Transport-Security (when behind TLS), etc. We disable
// contentSecurityPolicy by default because this is a JSON API
// (no HTML to protect) and a misconfigured CSP can break
// legitimate clients hitting the docs endpoint or future
// browser-based dashboards. Operators who add an HTML surface
// can re-enable via HELMET_CSP=1.
app.use(helmet({
    contentSecurityPolicy: process.env.HELMET_CSP === '1' ? undefined : false,
    crossOriginEmbedderPolicy: false,
}));

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

// Rate limit the v1 surface to defend against authKey brute-force.
// Defaults: 100 requests / 15-minute window per IP. Operators can
// tune via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX. Set
// RATE_LIMIT_MAX=0 to disable entirely (e.g. for load testing).
// /healthz is intentionally NOT rate-limited so orchestrator probes
// never trip it.
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX, 10);
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10);
if (rateLimitMax !== 0) {
    const v1Limiter = rateLimit({
        windowMs: Number.isFinite(rateLimitWindowMs) && rateLimitWindowMs > 0
            ? rateLimitWindowMs
            : 15 * 60 * 1000,
        max: Number.isFinite(rateLimitMax) && rateLimitMax > 0
            ? rateLimitMax
            : 100,
        standardHeaders: true,   // RateLimit-* headers
        legacyHeaders: false,    // no X-RateLimit-* legacy headers
        message: { message: 'Too many requests — try again later.' },
    });
    app.use('/v1', v1Limiter);
}

app.use('/', router);

// Listen port — env-configurable. Defaults to 3000 so the API can be
// started by a non-root user. Bind to 0.0.0.0 for container friendliness.
const port = parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
    const addr = server.address();
    log.info({ host: addr.address, port: addr.port }, 'Server listening');
});
