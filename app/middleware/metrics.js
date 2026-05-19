// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Prometheus metrics + middleware.
 *
 * Why
 *   /healthz is binary (up/down). For SLO work — error rates, p95
 *   latency by route, throughput per tenant — we need a richer
 *   surface. Prometheus is the de-facto pull-based standard and
 *   plays nicely with Grafana, Alertmanager, and most operators'
 *   existing infra.
 *
 * What's exposed
 *   - prom-client default Node.js metrics (event-loop lag, heap,
 *     GC, etc.) — auto-registered.
 *   - `http_requests_total{method,route,status}` counter — one
 *     bump per HTTP request, labelled with the original Express
 *     route pattern (e.g. `/v1/customer/:id` not the rendered
 *     `/v1/customer/42`) so cardinality stays bounded.
 *   - `http_request_duration_seconds{method,route,status}`
 *     histogram — for p50/p95/p99 latency calculations in
 *     Prometheus.
 *
 * What's NOT exposed
 *   - authKey or req.companyId labels. Putting either in label
 *     cardinality would explode the metric store (one time-series
 *     per unique key). Per-tenant metrics belong in structured
 *     logs aggregated server-side.
 *   - Path-as-label without route pattern. `req.route?.path`
 *     gives us the pattern after Express has matched; on a 404
 *     `req.route` is undefined and we fall back to `'<unknown>'`
 *     to keep the cardinality cap intact.
 *
 * Auth
 *   - Default: /metrics is OPEN. The intended deployment puts
 *     Prometheus on the same private network and lets the
 *     reverse proxy gate exposure.
 *   - Operators on shared infra can set METRICS_BEARER_TOKEN
 *     to require `Authorization: Bearer <token>` on the scrape.
 *     If the env var is unset, no auth is enforced. The check
 *     is a constant-time compare so a leaked token can't be
 *     enumerated character-by-character via timing.
 */

const crypto = require('crypto');
const promClient = require('prom-client');

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests, labelled by method, route pattern, and status code.',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
});

const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, labelled by method, route, status.',
    labelNames: ['method', 'route', 'status'],
    // Buckets sized to a JSON API: most requests in the 1-50ms range,
    // tail in the 100ms-2s range, with a few headroom buckets for
    // outliers (cold migrations, DB stalls).
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
});

/**
 * Express middleware: time each request and bump the counters on
 * `res.finish`. Mounted ONCE at the top of the chain in server.js;
 * the listener fires regardless of which controller served the
 * response, so 404s and middleware-level errors are captured.
 */
function metricsMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
        // After Express has matched, req.route?.path is the route
        // pattern (e.g. `/v1/customer/:id`). For 404s req.route is
        // undefined; bucket those into a single `<unknown>` label so
        // cardinality doesn't grow per distinct mistyped URL. Every
        // route in this codebase is mounted at the top-level router
        // with its full path, so the pattern already includes the
        // /v1 prefix — there is no `req.baseUrl` to prepend.
        const route = (req.route && req.route.path) || '<unknown>';
        const labels = {
            method: req.method,
            route,
            status: String(res.statusCode),
        };
        httpRequestsTotal.inc(labels);
        httpRequestDuration.observe(labels, elapsedSec);
    });
    next();
}

/**
 * Optional bearer-token check on /metrics. Pulled into its own
 * function so the gate can be unit-tested without spinning the
 * server.
 */
function checkMetricsAuth(req) {
    const required = process.env.METRICS_BEARER_TOKEN;
    if (!required) return true;  // gate disabled

    const header = req.get && req.get('Authorization');
    if (!header) return false;
    const m = /^Bearer\s+(.+)$/.exec(header);
    if (!m) return false;
    const supplied = m[1];

    // Constant-time compare on equal-length buffers; if lengths
    // differ we still pay the comparison cost (so a length check
    // doesn't leak).
    const a = Buffer.from(supplied);
    const b = Buffer.from(required);
    if (a.length !== b.length) {
        // Hash both to equal-length bytes so timingSafeEqual is
        // willing to run; result is still deterministic-false
        // because the original lengths differed.
        return crypto.timingSafeEqual(
            crypto.createHash('sha256').update(a).digest(),
            crypto.createHash('sha256').update(b).digest(),
        ) && false;
    }
    return crypto.timingSafeEqual(a, b);
}

/**
 * GET /metrics handler. Emits prom-client's text-format payload
 * with the correct Content-Type for a Prometheus scrape.
 */
async function metricsHandler(req, res) {
    if (!checkMetricsAuth(req)) {
        return res.status(401).json({ message: 'Unauthorized.' });
    }
    res.setHeader('Content-Type', registry.contentType);
    return res.status(200).send(await registry.metrics());
}

module.exports = {
    metricsMiddleware,
    metricsHandler,
    checkMetricsAuth,
    registry,
};
