# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Bulk-create endpoints for 5 direct-compId entities** (P3-H).
  New `POST /v1/<entity>/bulk` on Worker, BillingType, InventoryItem,
  InventoryTransaction, and PurchaseOrderVendor. Same shape as the
  existing `POST /v1/customer/bulk`: 500-entry cap, zod-strict
  whitelist, transactional all-or-nothing insert, master vs.
  non-master scoping enforced per entry. Shared
  `app/controllers/_bulk-helpers.js#makeBulkCreate` factory removes
  ~150 lines of would-be duplication; Customer's pre-existing handler
  keeps its bespoke logic until a follow-up unifies them.
- **Idempotency-Key support on POST routes** (P3-G).
  Clients may send an `Idempotency-Key: <printable-ASCII, 1-255>`
  header on any POST under `/v1/*`. The first response (status +
  JSON body) is cached in the new `dbo.IdempotencyKey` table for
  24h, keyed by `sha256(authKey:method:path)` + the raw key value.
  Retries with the same body replay the cached response and carry
  an `Idempotency-Replay: true` response header; retries with a
  DIFFERENT body return `409 { code: "idempotency_key_reused" }`.
  No-op for POSTs without the header — legacy clients are unaffected.
- **Sequelize associations across the full entity graph** (PR #54).
  Every FK now has a `hasMany`/`belongsTo` pair in `db.config.js`,
  enabling `include`-based eager loading and the auto-generated
  getter/setter methods. Verified via a 24-test unit suite that
  walks `Model.associations` and asserts each expected edge.
- **Integration test harness** against a real Postgres (PR #55).
  `tests/integration/` runs only when `DB_PASSWORD` is set + the
  Sequelize `authenticate()` call succeeds; skips gracefully
  otherwise so `npm test` keeps working unchanged.
- **Pre-built Postman collection** at
  `setup/TimeTrackerAPI.postman_collection.json` (PR #59).
  Generated from `app/config/openapi.js` via
  `openapi-to-postmanv2`; covers all 47 endpoints across 16
  entity folders. Regenerate after API changes with the one-liner
  in the README.
- **TLS reverse-proxy compose layer** (PR #60).
  Opt-in `docker-compose.tls.yml` puts Caddy in front of the api:
  automatic Let's Encrypt cert provisioning + renewal, HTTP →
  HTTPS redirect, HTTP/2 + HTTP/3 on :443, HSTS, X-Forwarded-*
  headers, gzip. `TLS_DOMAIN=localhost` opts into Caddy's
  built-in CA for local self-signed dev.
- **Committed `docker-compose.override.yml`** (PR #56) — exposes
  Postgres on `127.0.0.1:5432` for host-side integration test runs.

### Fixed
- `setup/TimeTracker.sql` is now idempotent against a populated
  database (PR #57). Re-running `docker compose up setup` against
  an existing schema is a no-op exit-0 rather than the previous
  exit-3 "schema dbo already exists" failure. Removes the
  `docker compose down -v` workaround from the dev flow.

### Docs
- Full integration-test bring-up flow documented in
  `tests/integration/README.md` (PRs #56 + #58). Covers the
  override file, env vars, fresh vs re-run behavior, and the
  conventions for cleanup sentinels.
- README gets sections for **Testing**, **Behind TLS (production)**,
  and a pointer to the Postman collection.

### Added (earlier in this [Unreleased] window)
- **PurchaseOrder + Inventory API surface** (#49, PRs #50, #51, #52):
  Full CRUD endpoints for the four tables added by the
  20260517000000 migration —
  - `PurchaseOrderVendor` — direct compId scoping
  - `PurchaseOrderHeader` — vendor-scoped via new
    `auth.getCompanyIdByPovId()` helper
  - `PurchaseOrderLine` — header-scoped via new
    `auth.getCompanyIdByPohId()` helper (two-hop FK walk through
    header → vendor)
  - `InventoryTransaction` — direct compId scoping; `invtDirection`
    constrained to 0 (inbound) or 1 (outbound) at the zod boundary
- `JSON_BODY_LIMIT` env override for `express.json()` body cap
  (#45, PRs #46 and #47). Default 100kb matches the express
  built-in; operators can raise it (`JSON_BODY_LIMIT=512kb`) for
  endpoints that legitimately accept larger payloads.

### Changed
- `npm audit fix` cleared 10 transitive-dep vulnerabilities
  (dottie, moment, moment-timezone, path-to-regexp, qs, underscore,
  validator). Direct deps bumped to latest patch within current
  majors: express 4.21.1 → 4.22.2, pg 8.6.0 → 8.20.0,
  express-promise-router 4.0.1 → 4.1.1, sequelize 6.6.5 → 6.37.8.
  (PR #48; closes Snyk-backlog tracker #30; supersedes / closes
  11 stale Snyk PRs.)

### Added (earlier in this [Unreleased] window)
- **API surface expansion** (#38, PR #39): full CRUD for ten entities
  that were in `setup/TimeTracker.sql` but lacked endpoints — Worker,
  Company, BillingType, InventoryItem, Job, Invoice, CustomerPayment,
  InvoiceJob, ProductEntry, VersionInfo. Path count went from 7 to 35.
- Three centralized auth-scoping patterns in `middleware/auth.js`:
  - Direct `compId` scoping (Worker, BillingType, InventoryItem) —
    same as Customer.
  - Customer-scoped via new `getCompanyIdByCustomerId()` helper
    (Job, Invoice, CustomerPayment) — auth walks parent FK.
  - Job-scoped via new `getCompanyIdByJobId()` helper
    (InvoiceJob, ProductEntry) — auth walks two-hop FK.
- Specials: Company has `compId` IS the company id (master-only
  POST/DELETE/list; GET/PATCH scoped to own row). VersionInfo is
  global, no archive column, reads open to any authKey, mutations
  master-only, DELETE is a hard destroy.
- Migration `20260517000000-purchase-orders-and-archive-columns`:
  creates `PurchaseOrderHeaders`, `PurchaseOrderLines`,
  `PurchaseOrderVendors`, and `InventoryTransactions` tables (omitted
  from the initial PG port of the BACPAC), and retrofits the missing
  `invitArch` and `injbArch` columns the new soft-delete logic
  depends on.
- `docker compose` now applies Sequelize migrations between the SQL
  bootstrap and the api start (new `migrate` one-shot service).
  Without this, migrations landed after the baseline never applied
  to containerized deploys. (#40, PR #41)
- `tini` runs as PID 1 in the container image for clean signal
  forwarding to the Node process (server.js already had the
  graceful-shutdown handler; tini just makes sure it gets the
  signal). (#40, PR #41)
- OCI `org.opencontainers.image.*` labels on the runtime image
  (source URL, license, vendor). (#40, PR #41)

### Changed
- `sequelize-cli` moved from `devDependencies` to `dependencies` so
  the production `npm ci --omit=dev` build can run migrations.
- HEALTHCHECK in the Dockerfile uses Node's built-in `http` module
  instead of `wget`; drops the `wget` apt-install layer. (#40)
- `.dockerignore` excludes `tests/`, `vitest.config.js`, `README.md`,
  `CHANGELOG.md`, and `docs/` from the runtime image; explicitly
  keeps `LICENSE` (Apache-2.0 §4(c) requires it accompany derivative
  works, including container images).

### Added (still earlier in this [Unreleased] window)
- Codeberg mirror at https://codeberg.org/CryptoJones/TimeTrackerAPI;
  README now carries badges for both forges.
- `GET /healthz` liveness + DB-readiness probe. No auth. Returns
  `{status, db, uptime_s, version, elapsed_ms}` as 200 ok / 503 degraded.
- `helmet` security headers (X-Content-Type-Options, X-Frame-Options,
  Strict-Transport-Security, Referrer-Policy, etc.). CSP off by default
  for the JSON API; enable via `HELMET_CSP=1`.
- `express-rate-limit` on `/v1` (default 100 requests / 15-minute window
  per IP, env-tunable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`).
  `/healthz` is exempt. `TRUST_PROXY` env for real-IP keying behind
  nginx / Caddy / Cloudflare.
- `pino` structured logger with authKey redaction; `pino-http` for
  per-request access logging. `LOG_LEVEL` / `LOG_PRETTY` /
  `TRIAGE_NO_LOG`-style env knobs.
- `POST /v1/customer` — first write endpoint. Body whitelist
  (mass-assignment defense); master keys must specify `custCompId`,
  non-master keys default to their own.
- `POST | GET | PATCH | DELETE /v1/timeentry/[:id]` and
  `GET /v1/timeentry/bycompany/:id` — five new time-entry endpoints,
  the headline feature for a project named "TimeTracker". Includes
  the `TimeEntry` Sequelize model, `setup/TimeEntry.sql` migration,
  two hot-path indexes, `teMinutes` computed on close, soft-delete via
  `teArch`.
- Pagination on `GET /v1/customer/bycompany/:id` (`?limit`, `?offset`,
  default 100 / max 500). Response now includes `count` for clients to
  paginate without an extra round-trip.
- OpenAPI 3.0 spec at `/openapi.json` + Swagger UI at `/docs` (both
  unauthenticated by design).
- Zod-backed request validation at the middleware boundary —
  `validate.body / .query / .params` reject malformed inputs with 400
  + structured `issues` array BEFORE they reach Sequelize.
- Dockerfile + docker-compose. `git clone + docker compose up` brings
  postgres + the schema bootstrap + the API up on port 3000.
- CI: GitHub Actions + Codeberg Woodpecker pipelines running vitest
  on Node 20 + 22.

### Changed
- `getCustomerById` was rewritten to fix a double-response fall-through
  bug where the master-key branch sent a response inside a `.then()`
  but didn't exit the surrounding async function, causing
  `Cannot set headers after they are sent` on real master-key traffic.
- `IsMaster` / `GetCompanyId` / `GetCustomerCompanyId` no longer index
  `result[0].x` without checking the array is non-empty (eliminates a
  noisy log entry every time an unknown authKey hits the API).
- `console.log` / `console.error` everywhere → `log.error({err}, '...')`
  with structured fields. Tests set `LOG_LEVEL=silent` so error-path
  cases don't flood stdout.
- `GET /v1/customer/bycompany/:id` now filters out soft-deleted
  customers (`custArch = true`). Clients were already manually
  filtering; this aligns server behavior with the contract.
- `IsMaster` and `GetCompanyId` extracted from both controllers into
  `app/middleware/auth.js` — single source of truth.

### Removed
- `body-parser` dependency. Express has had it built-in as
  `express.json()` since 4.16 (Oct 2017); we're on ^4.21.

### Security
- Server runs as non-root inside the Docker image.
- `authKey` is redacted from all pino log lines via `pino.redact`
  paths covering `req.headers.authkey`, `req.headers.authKey`, and
  `req.headers.authorization`.
- All mass-assignment vectors (writing `custId`, `custArch`, `teId`,
  `teMinutes`, `teArch` via request body) blocked at the validation
  middleware boundary.

---

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
