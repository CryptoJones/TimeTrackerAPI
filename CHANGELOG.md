# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **Start/stop timer endpoints** (#396). `POST /v1/timeentry/start`
  opens an in-flight entry stamped with the server clock (teEndedAt
  null), rejecting a second concurrent timer for the same worker (409);
  `POST /v1/timeentry/{id}/stop` stamps the end time and computes
  `teMinutes`, 409-ing if already stopped. Reuses the existing columns —
  no migration. Same company-scoping / secure-404 / link validation as
  the rest of the time-entry API.
- **Expenses roll into invoices** (#418). `POST /v1/invoice/rollup` now
  takes `includeExpenses: true` — the customer's billable, un-invoiced
  expenses are priced (cost + markup) and added to the invoice subtotal
  alongside billed time, then stamped `expInvId` in the same transaction
  so they're marked invoiced and won't re-roll (mirrors
  `TimeEntry.teInvJobId`). An invoice can now be expenses-only. New pure
  `app/services/expense-rollup.js`; migration `20260531000000` adds the
  link column + index; `Invoice`↔`Expense` association.
- **Billable expenses with markup** (#417). `expBillable` marks an
  expense re-billable to the client; `expMarkupPct` (a fraction, e.g.
  `0.15`) marks it up over cost. New pure `app/services/expense-billing.js`
  computes the client-facing amount (0 if non-billable, else
  `cost × (1 + markup)`, exact-cent), surfaced as `billing.billableAmount`
  on `GET /v1/expense/{id}`. Both settable via create/PATCH; migration
  `20260530000000`. Sets up the expense→invoice roll-up (#418).
- **Expense entity + CRUD** (#416). A new `Expense` model (amount,
  category, description, date) scoped to a company (`expCompId`) and
  optionally linked to a customer (`expCustId`) and job (`expJobId`),
  migration `20260529000000`. Full REST: `POST /v1/expense`,
  `GET /v1/expense/bycompany/{id}` (customer/job/date filters +
  pagination), `GET|PATCH|DELETE /v1/expense/{id}`, with the same
  secure-404 cross-tenant scoping and soft-delete (`expArch`) as the
  other entities. Amount is `NUMERIC(14,2)` with a Number getter.
- **Invoice discounts & write-offs** (#421). `invDiscount` reduces the
  subtotal **before** tax at roll-up time (`discount` in the roll-up
  body, clamped to `[0, subtotal]`); `invWriteOff` records an
  uncollectible amount, settable via `PATCH /v1/invoice/{id}`, that
  counts toward "settled" in the payment-driven status/balance
  derivation (so a fully written-off invoice reads `paid`, balance `0`).
  Migration `20260528000000`; both `NUMERIC(14,2)`, exact-cent.
- **Invoice sales tax** (#420). A per-company default tax rate
  (`compTaxRate`, a fraction like `0.0725`) plus a per-invoice effective
  rate (`invTaxRate`), migration `20260527000000`. The time→invoice
  roll-up now applies tax to the subtotal — `taxRate` in the roll-up body
  overrides, else the company default, else 0 — setting `invTax` and
  `invTotal = subtotal + tax` (exact-cent). `compTaxRate` is settable via
  company create/PATCH. New pure `app/services/invoice-tax.js`.
- **Revenue & earnings summary** (#429) — `GET /v1/report/revenue`.
  Revenue (invoiced total) and collected (payments allocated) grouped by
  customer and by month, with outstanding per group and company totals,
  all exact-cent. Company-scoped; optional `customerId` and `from`/`to`
  (invoice date) filters. New pure `app/services/report-revenue.js`.
- **Hours summary report** (#431) — `GET /v1/report/hours`. Groups all
  closed time for a company by customer, job, and worker, each with a
  billable / non-billable split (minutes + hours), plus company-wide
  totals. Company-scoped; optional `customerId` / `workerId` / `from` /
  `to` filters. New pure `app/services/report-hours.js`.
- **Unbilled-time report** (#430) — `GET /v1/report/unbilled` (new
  `report` controller). Surfaces billable, not-yet-invoiced, job-linked
  time grouped customer → job, priced via the rate service and summed
  exactly, with hours + amount per job/customer and a grand total — the
  "money you haven't billed yet" view that drives the next roll-up.
  Company-scoped; optional `customerId` and `from`/`to` filters.
- **Accounts-receivable aging report** (#422) — `GET /v1/invoice/aging`.
  Buckets a company's outstanding invoice balances by how overdue they
  are (`current` / `d1_30` / `d31_60` / `d61_90` / `d90plus`), each with
  a count + exact total, plus the outstanding invoices (most overdue
  first) and a grand total. Balances come from the payment-driven
  derivation (`invoice-status`) and settled invoices are excluded.
  Company-scoped (master keys pass `?companyId`).
- **Invoice PDF** (#391) — `GET /v1/invoice/{id}/pdf` streams a branded
  PDF (company header, bill-to, line items, subtotal/tax/total, amount
  paid + balance due, status) built by `app/services/invoice-pdf.js`.
  `pdfkit` is a new dependency, required lazily so it only loads on the
  PDF path. Same secure-404 tenant scoping as the JSON endpoint.
- **Configurable per-company invoice numbering** (#390). `Company` gains
  a sequence — `compInvPrefix` / `compInvPad` / `compInvNextSeq`
  (migration `20260526000000`, defaults `INV-` / `4` / `1`, settable via
  company create/PATCH) — and `Invoice` gains `invNumber`. Every invoice
  (manual create and the roll-up) is stamped with a human-facing number
  like `INV-0001` at creation, allocated under a row lock so concurrent
  creates never collide. `setup/*.sql` untouched.
- **Invoice status + outstanding balance** (#389). `GET /v1/invoice/{id}`
  now returns a derived `billing` object — `{ status, total, amountPaid,
  balance }` — computed from the payments allocated to the invoice
  (#392's `cpayInvId`) and its due date via the new
  `app/services/invoice-status.js`. Status is `draft` (no total yet) →
  `sent` → `partial` → `overdue` (past due, not settled) → `paid`;
  amounts are summed exactly through `money.js`. Derivation only — the
  stored `invPaid` flag is untouched.
- **Payments can be allocated to a specific invoice** (#392). New
  nullable `cpayInvId` on `CustomerPayment` (migration `20260525000000`)
  links a payment to the invoice it pays — `NULL` leaves it "on account"
  against the customer. Accepted on create/PATCH (validated so the
  invoice belongs to the same customer as the payment; PATCH `null`
  de-allocates). This is the input the upcoming invoice balance/status
  derivation (#389) reads. `setup/*.sql` untouched.
- **Time→invoice roll-up** (#382) — `POST /v1/invoice/rollup`. Generates
  an invoice from a customer's billable, uninvoiced, job-linked time:
  each entry is priced via the rate service, summed exactly through
  `money.js`, and grouped into one `InvoiceJob` line per job; the invoice
  gets its `invSubtotal`/`invTax`/`invTotal`, and every contributing
  entry is stamped with the new `teInvJobId` (migration `20260524000000`)
  so the same minutes can never be billed twice. Invoice, lines, entry
  stamps, and job flags commit as one transaction. Time that couldn't be
  billed (non-billable, no job, or no resolvable rate) is reported back
  in a `skipped` summary rather than silently dropped. Optional
  `from`/`to` bound the entries by start date; `invDate`/`invDueDate`
  default to today / +30 days.
- **Billing-rate resolution + computed billable amount** (#387). New
  `app/services/rate.js` resolves a time entry's effective hourly rate —
  the entry's own `BillingType` (new nullable `teBillTypeId` override,
  migration `20260523000000`) first, then the worker's default
  `BillingType` — and computes the billable amount through the exact
  `money.js` (rate × hours; `0` for non-billable; `null` when no rate
  resolves). `GET /v1/timeentry/{id}` now returns a `billing`
  `{ rate, billableAmount }` object alongside the entry. `teBillTypeId`
  is accepted on create/PATCH (validated to a billing type in the
  caller's company; PATCH `null` clears the override).
- **Exact-money service + stored invoice totals** (#388). New
  `app/services/money.js` does all billing arithmetic in integer cents
  (rounding half away from zero) so decimal amounts never drift
  (`0.1 + 0.2` is exactly `0.3`); it's the single source of truth for
  the roll-up, tax/discount, and payment-balance math to come. `Invoice`
  gains `invSubtotal` / `invTax` / `invTotal` `NUMERIC(14,2)` columns
  (migration `20260522000000`) with Number getters (pg returns NUMERIC
  as a string). The columns are nullable — populated by the time→invoice
  roll-up (#382); `NULL` means "not yet totalled". `setup/*.sql` (frozen
  original schema) untouched.
- **Time entries can be linked to a Worker and a Job** (#385, #386).
  `TimeEntry` gains nullable `teWorkerId` / `teJobId` columns (migration
  `20260521000000`) so tracked time is attributable to the person who
  logged it and the project it was worked against — the schema
  foundation for rate resolution and the time→invoice roll-up. `POST`
  and `PATCH /v1/timeentry` accept both fields (`PATCH` with `null`
  unlinks), validated so the worker belongs to the caller's company and
  the job belongs to the same company *and* the same customer as the
  entry. Existing rows and quick ad-hoc time may leave either unset. Per
  the increment-layer migration convention the columns carry no physical
  FK constraint (enforced at the app layer); `setup/*.sql`, the frozen
  original schema, is left untouched.
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

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
