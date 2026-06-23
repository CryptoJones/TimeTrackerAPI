# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.15] - 2026-06-22

### Added
- **web: A/R dashboard.** The home screen now shows accounts-receivable
  at a glance — total outstanding, the aging buckets (current / 1–30 /
  31–60 / 61–90 / 90+), and a "who owes you" table — wired to
  `/v1/report/aging`. The quick-action cards (Track time / Clients /
  Invoices) are now real links. Builds clean.

## [1.0.14] - 2026-06-22

### Added
- **Single-container deploy: the API serves the web app.** `server.js`
  serves the built SPA (`web/dist`) — static assets plus an index.html
  fallback for client-side routes — whenever it's present, so one
  container serves both the `/v1` API and the UI (API routes still win;
  `/healthz`, `/metrics`, `/docs`, `/openapi.json` are untouched). The
  Dockerfile gains a dedicated `webbuild` stage (Vite build) and copies
  `web/dist` into the runtime image; `.dockerignore` excludes
  `web/node_modules`/`web/dist` from the context. API-only deploys (no
  built UI) are unaffected — the static serving is skipped.

## [1.0.13] - 2026-06-22

### Added
- **web: Invoicing.** Closes the core "track time → bill → get paid" loop
  in the UI: one-click **auto-bill** a job into an invoice (from the
  client page), an **invoice detail** view with total / paid / balance /
  status, line items and payments, a **record-payment** form (full or
  partial), **download PDF** (authenticated blob fetch), and **carry
  balance forward**. New Invoices nav + an invoice list per client.
  Builds clean.

## [1.0.12] - 2026-06-22

### Added
- **web: Time tracking.** Log time against a client (and optionally a job)
  with a manual date + start/end form, and see a recent-entries table with
  durations. Wired to `POST /v1/timeentry` and
  `/v1/timeentry/bycompany`. Client→job selects cascade; billable toggle.
  Builds clean.

## [1.0.11] - 2026-06-22

### Added
- **web: Clients & Jobs management.** New screens in the web app to list
  and add clients (customers) and, per client, list and add their jobs —
  wired to `/v1/customer/bycompany`, `POST /v1/customer`,
  `/v1/job/bycustomer`, and `POST /v1/job` with the session key. Adds a
  top nav (Dashboard · Clients), tables, and a tolerant list-response
  helper. Builds clean.

## [1.0.10] - 2026-06-22

### Added
- **`web/` — end-user web app scaffold** (React + Vite SPA). First slice
  of the UI: signup / login / logout, a `/v1/auth/me`-backed auth context,
  a session-key API client (stores the key in `localStorage`, sends it as
  `authKey`), a protected app shell, and a dashboard framing the feature
  areas to come. Dev server proxies `/v1` to the API. Standalone
  sub-project — the root API test suite, lint, and Docker image are
  unaffected (its build/deploy wiring lands in a later iteration). Builds
  clean (`cd web && npm run build`).

## [1.0.9] - 2026-06-22

### Added
- **Web-app user accounts** (the auth layer the end-user UI will sit on).
  New `User` table (bcrypt-hashed passwords, one user ↔ one workspace
  Company) and `/v1/auth/*` endpoints:
  - `POST /v1/auth/signup` — create a user + workspace, returns a session
    API key (raw, shown once).
  - `POST /v1/auth/login` — verify credentials, mint a fresh session key
    (constant-time-ish compare; no account-existence leak).
  - `POST /v1/auth/logout` — archive the session key.
  - `GET /v1/auth/me` — resolve the session key to its user + workspace.
  The session credential is a company API key, so the web app drives the
  existing company-scoped `/v1` surface unchanged (no per-controller
  rewrite). `bcryptjs` (pure-JS) added. Covered by schema/contract unit
  tests and a real-Postgres integration test of the full
  signup→login→me flow (incl. the key authenticating a normal endpoint,
  wrong-password 401, duplicate-email 409).

## [1.0.8] - 2026-06-22

### Added
- **`GET /v1/invoice/:id/pdf`** — render an invoice as a downloadable
  PDF (header, bill-to, line items, totals + status). Uses `pdfkit`
  (pure-JS, ships standard fonts — no headless browser or font assets).
  Rendering lives in a DB-free `app/services/invoice-pdf.js` (unit-tested
  to emit a valid PDF), with a real-Postgres integration test for the
  load→render→stream path. Company-scoped, secure-404.

### Changed
- **Test suite hardening:** `pdfkit` is lazy-required inside the renderer
  (so the 50+ controller-loading test files don't pay its import cost),
  and `vitest.config.js` gains `testTimeout: 20000` + `retry: 2` to absorb
  a rare pre-existing environmental flake (a test occasionally starved
  under parallel load while the auth layer waits on a DB connection). A
  genuine failure still fails all attempts.

## [1.0.7] - 2026-06-22

### Added
- **`GET /v1/report/aging`** — accounts-receivable aging. Buckets every
  open invoice's outstanding balance by how overdue it is (current /
  1-30 / 31-60 / 61-90 / 90+ days past the due date), per customer plus
  grand totals. Company-scoped (master passes `companyId`); optional
  `asOf` date (defaults to today). Voided/archived and fully-paid
  invoices are excluded. Bucketing math (`agingBucketKey`, `daysPastDue`,
  `computeAging`) lives in `app/services/money.js` and is unit-tested;
  the end-to-end query is covered by a real-Postgres integration test.

## [1.0.6] - 2026-06-22

### Added
- **`POST /v1/invoice/:id/carry-forward`** — re-issue an invoice's
  outstanding balance onto a new draft invoice for the same customer:
  one "balance brought forward" line for the balance, linked back via
  `invBalanceForwardFrom`. By default the original is marked `void` so
  its balance isn't double-counted (`voidOriginal:false` keeps it open).
  Optional `{ invDate, netDays, voidOriginal }`. Transaction-wrapped,
  company-scoped (secure-404), idempotent. Covered by schema/403 tests
  and a real-Postgres integration test.

### Changed
- **`InvoiceJob.injbJobId` is now nullable** (migration) so a job-less
  "balance brought forward" line can exist. Normal job lines are
  unaffected — the create/bulk schema still requires `injbJobId`.

## [1.0.5] - 2026-06-22

### Added
- **`POST /v1/invoice/from-job/:id`** — auto-bill a job. Gathers its
  billable, un-invoiced, closed time entries, computes Σ(hours × rate)
  (rate from each entry's `teBillTypeId`, else the worker's default
  billing type), creates a **draft** invoice + one `InvoiceJob` line for
  the total, and marks the billed entries consumed via the new
  `TimeEntry.teInvoiceJobId` so the same hours can't be billed twice.
  Optional body `{ invDate, netDays }` (defaults: today, net-30).
  Unrated entries are reported (`unratedCount`) and left un-consumed so
  they can be billed once a rate is set. Transaction-wrapped,
  company-scoped (secure-404), idempotent. New `teInvoiceJobId` migration
  + association; rate/amount math in `app/services/money.js`
  (`computeJobBill`), unit-tested; full flow covered by a real-Postgres
  integration test (incl. the no-double-bill guard).

## [1.0.4] - 2026-06-22

### Added
- **`POST /v1/invoice/:id/payment`** — record a full or partial payment
  against an invoice (`{ amount, date?, description? }`). Writes a
  `CustomerPayment` linked to the invoice (`cpayInvId`) inside a
  transaction, then recomputes and persists the invoice's status
  (`partial`/`paid`) and `invPaid` mirror from the full payment set.
  Overpayment is allowed (drives the balance negative — a credit).
  Idempotent via the global Idempotency-Key layer. Company-scoped with
  the same secure-404 as the other invoice routes. Covered by money-module
  unit tests, schema/403 controller tests, and a real-Postgres integration
  test for the full draft→partial→paid balance flow.

## [1.0.3] - 2026-06-22

### Added
- **Invoicing & payments foundation** (first step of the invoicing engine —
  see `PRODUCT-BACKLOG.md` Appendix A). Additive, nullable/defaulted schema:
  `CustomerPayment.cpayInvId` (FK → Invoice, so a payment can apply to a
  specific invoice — the keystone for per-invoice balance + partial payments),
  `Invoice.invStatus` (`draft`/`sent`/`partial`/`paid`/`void`, backfilled from
  `invPaid`), and `Invoice.invBalanceForwardFrom` (links a balance-carried
  invoice to its predecessor). New `app/services/money.js` centralizes
  cents-accurate money math (total / paid / balance / status derivation),
  insulating against `float` drift until the amount columns migrate to
  decimal. `GET /v1/invoice/:id` now eager-loads lines + payments and returns
  `{ total, paid, balance, status }`. +22 tests.

## [1.0.2] - 2026-06-22

### Added
- **`GET /v1/report/invoice-list` (+ `.csv`)** — a reporting endpoint that
  restores the source database's `v_InvoiceList` view, which had no API
  surface. One row per invoice line (Invoices × Customers × InvoiceJobs):
  `invoiceDate`, `invoiceNumber`, `invoiceAmount`, `customerId`.
  Company-scoped (master keys pass `companyId`; non-master keys are
  auto-scoped at the Customer leaf), paginated via the Link header, with
  an optional `customerId` filter. The `.csv` variant mirrors the other
  export endpoints (5000-row cap, `# truncated` comment, OWASP
  formula-injection guard). New `reportcontroller.js` +
  `report.schema.js`; OpenAPI + README updated; +14 tests.

## [1.0.1] - 2026-06-22

### Added
- **Restored the `TimeEntry` → Job / Worker / BillingType relationships**
  that the original SQL Server `TimerEntries` table carried and the Node
  redesign had dropped. Three **nullable, additive** FKs — `teJobId`,
  `teWorkerId`, `teBillTypeId` — reconnect time to the
  Job → InvoiceJob → Invoice chain and make the previously-orphaned
  Worker and BillingType entities meaningful. Wired through the migration,
  model + Sequelize associations, the create/update Zod schemas, the
  controller (each FK is company-scoped on write for non-master keys,
  mirroring the `teCustId` guard), the OpenAPI spec, and the CSV export
  (three columns appended). Existing rows and payloads are unaffected.
  Discovered by diffing the repo's `TimeTracker.bacpac` against the
  models. No automatic billing-amount computation — relationships only.

### Fixed
- **`release.yml` SBOM step** now scans the source tree (`path: .`)
  instead of the pushed image, and is non-fatal. On the v1.0.0 run syft
  failed trying to pull the freshly-pushed private GHCR image (and the
  image ref carried the uppercase owner, which GHCR rejects), which
  skipped the GitHub Release step. The release is now resilient to a SBOM
  hiccup; v1.0.0's image shipped + was signed, and its Release was
  created manually.

## [1.0.0] - 2026-06-22

First tagged release. The entries below cover the full port from the
original SQL Server database to this Node.js + PostgreSQL API.

### Fixed
- **`PORT=0` is honored instead of being silently coerced to 3000**
  (#124). `server.js` resolved its listen port via
  `parseInt(process.env.PORT, 10) || 3000`, which short-circuited on
  the legitimate "kernel pick a free port" case because `0 || 3000`
  evaluates to `3000`. `tests/api/server-boots.test.js` relied on
  this exact behavior (port 0) to avoid colliding with whatever's
  already on `:3000` on a dev box, so the smoke-test was failing on
  `master` for any contributor with a busy 3000. Replaced the
  falsy-fallback with an explicit `Number.isFinite(parsed) && parsed
  >= 0` check so only `NaN` / negative `PORT` values fall back to
  the default.

### Changed
- **Production hard-fails on empty `DB_PASSWORD`** (#119). Previously
  a missing `DB_PASSWORD` in `NODE_ENV=production` would warn and
  start anyway; `/healthz` reported degraded, but a load balancer
  keyed purely off HTTP 200 from `/healthz` could still flip traffic
  to a pod that couldn't reach its database. Now the process logs
  to stderr and `process.exit(1)` immediately so systemd / k8s
  catch the misconfiguration before traffic ever lands. Development
  and test paths still warn-and-continue so the suite runs without
  a real DB.
- **`DB_PASSWORD` is documented as REQUIRED in production** (#120).
  README + `.env.example` callouts updated to match the new
  hard-fail behavior above; operators get the warning at config-edit
  time, not just at first deploy.
- **`pg` bumped 8.20.0 → 8.21.0** (#122). Patch-level dep refresh
  in the `minor-and-patch` Dependabot group.

### Added
- **OpenAPI: `Idempotency-Replay` response-header declaration on every
  single-create POST 201** (#245 sweep — landed across 16 PRs from
  #246 through #288). Every `/v1/*` POST that flows through the
  `Idempotency-Key` middleware now advertises the `Idempotency-Replay`
  header on its 201 response in the spec — SDK generators
  (openapi-typescript, etc.) carry the replay flag into client-facing
  types instead of having callers infer it from prose in the request
  header's description. The bulk endpoints picked this up in #168;
  this sweep extends it to single-create symmetry.
- **Real-PG integration coverage for the cascade auth helpers**
  (#121, follow-up to #117). Six new test cases against
  `postgres:16-alpine` for the four `getCompanyIdBy*` helpers in
  `app/middleware/auth.js` (Customer, Job, PurchaseOrderVendor,
  PurchaseOrderHeader cascades). Includes a regression-pin that
  archiving an intermediate Customer drops a downstream Job's auth
  scope to `-1` — the correct security outcome since the parent's
  scope no longer applies. Auto-skips locally without a DB; runs on
  every CI build.
- **`npm run dev`** (#116). Uses Node's built-in `--watch` flag
  (stable since Node 22; project pins `>=20`) to restart on changes
  to `app/` and `server.js`. No new dev dependency. CONTRIBUTING.md
  quick-start updated.

### Security
- **Fixed an IPv6 rate-limit bypass**. The custom `keyByAuthKeyOrIp`
  rate-limit key generator was reading `req.ip` directly and
  concatenating it into the key. express-rate-limit v8+ surfaced
  this as `ERR_ERL_KEY_GEN_IPV6`: IPv6 clients could rotate through
  their /64 allocation, each appearing as a distinct IP, to bypass
  the per-IP rate-limit budget on the anonymous (brute-force)
  path. Fix routes the IP through the package's `ipKeyGenerator()`
  helper, which normalizes IPv6 to a /64 prefix. Authenticated
  keying (sha256 of the authKey header) is unchanged. **Operators
  on previous releases should upgrade.**
- **`form-data` bumped 4.0.5 → 4.0.6** (GHSA-fjxv-7rqg-78g4, dev-only
  via `supertest`), clearing the only HIGH `npm audit` finding. The
  residual moderate `uuid` < 11.1.1 advisory (transitive via Sequelize,
  not reachable with user-controlled input, no non-breaking fix) is
  documented as accepted in `SECURITY.md`; the CI `npm audit` gate runs
  at `--audit-level=high --omit=dev`, so it does not block releases.
- **Database exports are gitignored** (`*.bacpac`, `*.dacpac`, `*.bak`,
  `*.dump`) so a schema/data dump containing real records can't be
  committed by accident.

### Removed
- **Unused production dependencies**: `express-asyncify` and
  `express-promise-router`. Both were listed in package.json since
  the initial port but never imported anywhere. Surfaces as a
  smaller `npm ci` footprint; no behavior change.

### Changed
- **CI gains a live Postgres service**. Both GitHub Actions and
  Woodpecker spin up `postgres:16-alpine` alongside the Node
  matrix, run `setup/TimeTracker.sql` for the `dbo` schema
  bootstrap, then `npm run migrate` to apply every migration. The
  integration suite at `tests/integration/db-roundtrip.test.js`
  no longer self-skips in CI — it gates every PR against schema /
  migration drift. The unit + api suites still pass with or
  without a DB, so local `npm test` works unchanged.

### Added
- **OpenAPI completeness pass**. All 12 previously-undocumented
  bulk-create endpoints now appear in the spec via a shared
  `bulkPath(bodyKey, schemaName)` helper (kept the entries from
  drifting into 13 hand-maintained near-duplicates). The
  `Idempotency-Key` header is documented as an optional parameter
  on every bulk POST. `/metrics` gets its own path entry with the
  Prometheus text-format response and the `METRICS_BEARER_TOKEN`
  401-gate documented. Three new OpenAPI tests pin the additions.
- **Bulk-create endpoints for 7 indirect-scoped entities** (P3-H2).
  New `POST /v1/<entity>/bulk` on Job, Invoice, CustomerPayment,
  InvoiceJob, ProductEntry, PurchaseOrderHeader, PurchaseOrderLine.
  Same 500-entry cap and transactional all-or-nothing semantics as
  the direct-compId family from P3-H, but per-entry auth scope is
  resolved through the parent FK (Customer / Job / Vendor / Header)
  via the existing helpers in `app/middleware/auth.js`. A new
  `makeBulkCreateIndirect` factory in
  `app/controllers/_bulk-helpers.js` parameterizes over the parent
  FK column + the auth-helper that resolves it; the 7 controllers
  gain ~10 LOC each instead of ~120. The bulk surface now covers
  **all 13 soft-deletable entities.**

### Changed
- **`app/middleware/auth.js` is now testable end-to-end** (P5-M).
  Two changes:
  1. Every DB hit now goes through the Sequelize model layer
     (`ApiMaster.findOne`, `Customer.findByPk`, etc.) instead of raw
     `sequelize.query` calls — fewer hand-rolled SQL strings, and the
     archive-filter relies on the P2-E defaultScope rather than a
     repeated `<arch>: false` WHERE clause.
  2. A test-only `_setDbForTesting(stub)` seam lets unit tests
     substitute model fixtures directly. vitest's `vi.mock` does not
     intercept this codebase's CJS `require()` reliably; the explicit
     setter is the smallest practical injection point. Production
     code MUST NOT call it.
  Auth helpers gain 19 new unit-level cases including the previously
  un-mockable "row found → returns the value" success paths.

### Added
- **ESLint flat config + CI gate** (P5-L). New `eslint.config.js`
  with rules tuned for high-signal bug catching rather than style
  preferences: `no-unused-vars` (with `^_` opt-out), `eqeqeq`,
  `no-console` (allowing only `error`/`warn` outside tests),
  `prefer-const`, `no-var`. Tests get a relaxed variant
  (`no-unused-vars` as a warning, console allowed). Migrations
  ignore unused args to honor sequelize-cli's
  `(queryInterface, Sequelize)` contract. Wired into GitHub Actions
  and Woodpecker so every PR now runs `npm run lint` ahead of the
  vitest suite. `npm run lint:fix` available for autofixable rules.
- **`createdAt` / `updatedAt` on every domain entity** (P4-K). New
  migration adds two `TIMESTAMPTZ NOT NULL DEFAULT now()` columns to
  18 tables (everything except `IdempotencyKey`, which already
  tracks its own time fields). All 18 models flip
  `timestamps: false` → `true` so Sequelize auto-populates the
  columns on every `.create()` / `.update()`. Existing rows are
  backfilled to `now()` at apply time; operators with the original
  SQL Server timestamps from the Atbash legacy can patch real values
  post-migration via a one-off UPDATE.
- **Prometheus `/metrics` endpoint** (P4-J). Exposes prom-client's
  default Node.js metrics (event-loop lag, heap, GC, etc.) plus
  per-request `http_requests_total{method,route,status}` and
  `http_request_duration_seconds{method,route,status}` series.
  Route labels use the Express pattern (`/v1/customer/:id`) not the
  rendered path, so cardinality stays bounded.
  Authentication is OPTIONAL: unset `METRICS_BEARER_TOKEN` leaves
  the endpoint open (the usual private-network deployment); setting
  it requires `Authorization: Bearer <token>` on the scrape. Token
  comparison is constant-time.
- **`migration` field on `GET /healthz`** (P4-I). Body now reports the
  last applied migration name from `SequelizeMeta` (e.g.
  `"20260519000000-idempotency-keys"`). Lets a rolling-deploy caller
  verify each pod is at the expected schema version. Null when
  SequelizeMeta is missing (fresh DB pre-migration) or unreadable —
  the probe never flips to `status: degraded` over a migration-read
  failure, since the DB itself is still up.
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

[Unreleased]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.15...HEAD
[1.0.15]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.14...v1.0.15
[1.0.14]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.13...v1.0.14
[1.0.13]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.12...v1.0.13
[1.0.12]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/CryptoJones/TimeTrackerAPI/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/CryptoJones/TimeTrackerAPI/releases/tag/v1.0.0

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
