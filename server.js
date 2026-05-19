// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');

const db = require('./app/config/db.config.js');
const log = require('./app/config/logger.js');
const router = require('./app/routers/router.js');
const { errorHandler, notFound } = require('./app/middleware/error-handler.js');
const { metricsMiddleware } = require('./app/middleware/metrics.js');
const { redactUrl } = require('./app/middleware/redact-url.js');

const app = express();

// Defense-in-depth: helmet already strips X-Powered-By, but this
// disables it at the express level too in case a future middleware
// re-adds it (e.g. a buggy plugin doing `res.setHeader`).
app.disable('x-powered-by');

// ETag generation isn't useful for an authKey-scoped JSON API where
// every response is per-user — clients can't safely cache, and the
// hash computation costs CPU for nothing. Disable it explicitly.
app.set('etag', false);

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
    // Trust an incoming X-Request-Id header if present (so a reverse
    // proxy / mesh can propagate trace context), otherwise generate
    // a fresh one. The id lands on req.id, is echoed back on the
    // X-Request-Id response header, and is included in every log
    // line via pino-http's reqId binding.
    //
    // Validate the incoming value's character set, not just its
    // length: Node's `res.setHeader` throws ERR_INVALID_CHAR on
    // anything outside the printable-ASCII range (e.g. CR, LF, NUL),
    // and a thrown setHeader inside pino-http's request hook
    // crashes the request handler and surfaces as a 500. Limiting
    // to printable ASCII [0x21..0x7e] (no spaces, no control chars)
    // matches the W3C trace-id alphabet and the de-facto format used
    // by every proxy / mesh / APM agent we'd be propagating from.
    genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const valid = typeof incoming === 'string'
            && incoming.length > 0
            && incoming.length <= 128
            && /^[\x21-\x7e]+$/.test(incoming);
        const reqId = valid ? incoming : crypto.randomUUID();
        res.setHeader('X-Request-Id', reqId);
        return reqId;
    },
    serializers: {
        req: (req) => ({
            method: req.method,
            // url is redacted at the serializer boundary — if an SDK
            // mistakenly puts the authKey in the query string instead
            // of the header, the raw value still doesn't land in the
            // structured log. Header values are separately covered by
            // logger.js's redact paths.
            url: redactUrl(req.url),
            remoteAddress: req.remoteAddress,
        }),
    },
}));

// Trust proxy headers when running behind nginx/caddy/cloudflare so
// rate-limit keys on the real client IP instead of the proxy IP.
// Operators opt in via TRUST_PROXY (true|false|<hop count>). Default
// false to avoid the security pitfall of trusting X-Forwarded-For
// from a non-proxied client.
//
// The hop-count branch uses a strict regex match (^\d+$) rather than
// `parseInt + !isNaN`, because parseInt is lenient — it would happily
// turn `TRUST_PROXY=1abc` (an operator typo) into `1` and silently
// trust one hop. With the regex an invalid value falls through to
// the implicit Express default (no trust) instead of partially
// honoring a malformed setting.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === 'true') {
    app.set('trust proxy', true);
} else if (typeof trustProxy === 'string' && /^\d+$/.test(trustProxy)) {
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
    // Headers the browser JS layer needs to read off cross-origin
    // responses. CORS hides any header not on the safelist unless we
    // expose it explicitly here:
    //   - Link              RFC 5988 pagination (next/prev/first/last)
    //   - X-Request-Id      correlate a 5xx with a server log line
    //   - Idempotency-Replay flagged when the response is a replay,
    //                        not a fresh write (P3-G)
    //   - RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
    //                        standard RFC headers from express-rate-limit
    exposedHeaders: [
        'Link',
        'X-Request-Id',
        'Idempotency-Replay',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
    ],
}));

// Body size limit. The default in express.json() is 100kb; we make
// it explicit + env-tunable. Capping the body size is a basic
// defense against memory-exhaustion DoS — even an unauthenticated
// caller can otherwise force the server to buffer arbitrarily
// large JSON strings before the parser can reject them.
//
// 100kb is comfortably above any expected payload here (the largest
// real body is a TimeEntry create with a teDescription, capped at
// 10000 chars in the zod schema). Operators with unusual needs can
// override via JSON_BODY_LIMIT=512kb (etc.).
app.use(express.json({
    limit: process.env.JSON_BODY_LIMIT || '100kb',
}));

// Rate limit the v1 surface to defend against authKey brute-force.
// Defaults: 100 requests / 15-minute window. Operators can tune via
// RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX. Set RATE_LIMIT_MAX=0 to
// disable entirely (e.g. for load testing). /healthz is intentionally
// NOT rate-limited so orchestrator probes never trip it.
//
// Key derivation:
//   - Authenticated requests (authKey header present): key by the
//     hash prefix of that authKey. Mobile-carrier-NAT users sharing
//     an IP no longer poison each other's budget; brute-force
//     attempts get cut off per-key regardless of how many IPs the
//     attacker rotates through.
//   - Anonymous requests (no header): key by IP, the
//     express-rate-limit default. This is the brute-force path —
//     someone trying keys to find a valid one — and per-IP is the
//     right granularity there.
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX, 10);
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10);
if (rateLimitMax !== 0) {
    const { keyByAuthKeyOrIp } = require('./app/middleware/rate-limit-key.js');
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
        keyGenerator: keyByAuthKeyOrIp,
    });
    app.use('/v1', v1Limiter);
}

// Metrics observer. Mounted BEFORE the router so it sees every
// request that flows through (including 404s). The handler at
// /metrics is exposed inside the router itself.
app.use(metricsMiddleware);

app.use('/', router);

// 404 fallthrough + global error handler. Order matters — these
// must be last so they catch what the router didn't.
app.use(notFound);
app.use(errorHandler);

// Listen port — env-configurable. Defaults to 3000 so the API can be
// started by a non-root user. Bind to 0.0.0.0 for container friendliness.
//
// Note: `parseInt(...) || 3000` would incorrectly coerce a legitimate
// PORT=0 (kernel-pick-a-free-port, used by tests/api/server-boots.test.js
// to avoid colliding with another dev process on :3000) to the 3000
// fallback. Branch explicitly so 0 is honored and only NaN / negatives
// fall through to the default.
const portRaw = parseInt(process.env.PORT, 10);
const port = Number.isFinite(portRaw) && portRaw >= 0 ? portRaw : 3000;
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
    const addr = server.address();
    log.info({ host: addr.address, port: addr.port }, 'Server listening');
});

// ---- graceful shutdown ----
//
// SIGTERM is what `docker stop`, `systemctl stop`, and Kubernetes
// pod-eviction all send. The default behavior is to drop in-flight
// requests + leak pg pool connections. Trap it and drain instead.
//
// Sequence:
//   1. server.close() — stops accepting new connections, lets the
//      ones already in flight finish (Node ≥18 honors keep-alive
//      headers and waits for the body).
//   2. db.sequelize.close() — drains the pg pool cleanly.
//   3. process.exit(0).
//
// If anything in the drain hangs longer than SHUTDOWN_TIMEOUT_MS
// (default 25s — under most orchestrators' 30s SIGTERM→SIGKILL
// window), we force-exit with code 1. SIGINT (Ctrl-C in dev) follows
// the same path so dev shutdowns aren't dirty either.

// `parseInt(...) || 25_000` accepts negative integers (parseInt('-100')
// = -100 is truthy, so it'd be used as the timeout — setTimeout(-100)
// fires immediately, force-exiting before the drain has a chance to
// run). Guard with the same Number.isFinite + >= 0 check used for
// PORT (#124) so only NaN and negatives fall back to the default.
const shutdownTimeoutRaw = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10);
const shutdownTimeoutMs = Number.isFinite(shutdownTimeoutRaw) && shutdownTimeoutRaw >= 0
    ? shutdownTimeoutRaw
    : 25_000;
let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    log.info({ signal }, 'received shutdown signal, draining');

    // Force-exit if drain hangs.
    const killer = setTimeout(() => {
        log.error({ signal, timeoutMs: shutdownTimeoutMs }, 'drain timeout, force-exiting');
        process.exit(1);
    }, shutdownTimeoutMs);
    killer.unref();

    try {
        // Stop accepting new connections.
        await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
        log.info('http server closed');
    } catch (err) {
        log.error({ err }, 'error closing http server');
    }

    try {
        await db.sequelize.close();
        log.info('db pool closed');
    } catch (err) {
        log.error({ err }, 'error closing db pool');
    }

    log.info('shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
