# TimeTrackerAPI

Open-source rewrite of Atbash Services' TimeTrackerAPI on **Node.js + PostgreSQL**.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tests](https://github.com/CryptoJones/TimeTrackerAPI/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/CryptoJones/TimeTrackerAPI/actions/workflows/test.yml)
[![Codeberg](https://img.shields.io/badge/Codeberg-CryptoJones%2FTimeTrackerAPI-2185D0?logo=codeberg&logoColor=white)](https://codeberg.org/CryptoJones/TimeTrackerAPI)
[![GitHub](https://img.shields.io/badge/GitHub-CryptoJones%2FTimeTrackerAPI-181717?logo=github&logoColor=white)](https://github.com/CryptoJones/TimeTrackerAPI)

> Mirrored on both [GitHub](https://github.com/CryptoJones/TimeTrackerAPI) and
> [Codeberg](https://codeberg.org/CryptoJones/TimeTrackerAPI). Issues filed
> on either forge are welcome; commits are pushed to both.

Working example at [node.timetrackerapi.com](http://node.timetrackerapi.com).

## Endpoints

| Endpoint                            | Auth required | Description                                  |
|-------------------------------------|---------------|----------------------------------------------|
| `GET /healthz`                      | no            | Liveness + DB-readiness probe (returns `{status, db, uptime_s, version, elapsed_ms, migration}`; 200 ok / 503 degraded). `migration` carries the last applied migration name from `SequelizeMeta`, useful for verifying rolling-deploy schema versions. |
| `GET /metrics`                      | no (or bearer)| Prometheus scrape endpoint. Default Node.js metrics + per-request `http_requests_total` / `http_request_duration_seconds`. Authentication is OPTIONAL: leave `METRICS_BEARER_TOKEN` unset for an open scrape (private-network deployment) or set it to require `Authorization: Bearer <token>`. |
| `GET /docs`                         | no            | Interactive Swagger UI for the full API. |
| `GET /openapi.json`                 | no            | Raw OpenAPI 3.0 spec (machine-readable). |
| `GET /v1/whoami`                    | header        | Returns `{authenticated, isMaster, companyId}` for the calling `authKey`. Header MUST be present (403 if missing) but the key need NOT resolve — an unknown key returns 200 with `authenticated: false`. Useful for SDK clients to distinguish "network plumbing wrong" from "credential wrong" without inferring from a domain endpoint's 4xx. |
| `GET /v1/customer/:id`              | yes (`authKey`) | Single customer lookup. Master key sees all; non-master only sees customers in its own company. |
| `GET /v1/customer/bycompany/:id`    | yes (`authKey`) | Customers in a company (paginated). Master sees any; non-master only its own. Query params: `limit` (default 100, max 500), `offset` (default 0). Archived customers (`custArch = true`) are filtered out. |
| `POST /v1/customer`                 | yes (`authKey`) | Create a customer. Master key may target any `custCompId`; non-master keys can only create within their own company (and `custCompId` defaults to that). Returns 201 + the created customer. |
| `GET /v1/customer/search`           | yes (`authKey`) | Case-insensitive substring search across `custCompanyName`, `custFName`, `custLName`. Query params: `q` (2-char minimum), `companyId` (master-only — non-master keys are auto-scoped and a mismatched `companyId` returns 403), `limit` (default 100, max 500), `offset` (default 0). |
| `GET /v1/customer/export.csv`       | yes (`authKey`) | CSV export of customers in a company. Master keys must supply `companyId`; non-master keys are auto-scoped. `limit` (default 5000, max 5000). Cells starting with `=`, `+`, `-`, `@`, tab, or CR are prefixed with a single quote to defuse OWASP CSV-formula injection on spreadsheet-app open. |
| `POST /v1/timeentry`                | yes (`authKey`) | Create a time entry. Body: `teCustId` (required), `teStartedAt` (required, ISO 8601), `teEndedAt` (optional — in-flight entries allowed), `teDescription`, `teBillable` (default true). `teMinutes` is computed server-side on close. |
| `GET /v1/timeentry/:id`             | yes (`authKey`) | Single time entry lookup. Company-scoped. Archived (soft-deleted) entries return 404. |
| `GET /v1/timeentry/bycompany/:id`   | yes (`authKey`) | List time entries for a company. Query params: `customerId` (filter), `from` / `to` (ISO 8601 date range on `teStartedAt`), `limit` (default 100, max 500). Ordered most-recent first. |
| `GET /v1/timeentry/export.csv`      | yes (`authKey`) | CSV export of time entries. Same auth contract + CSV-injection guard as `/v1/customer/export.csv`. Query params: `companyId` (master-only), `customerId` (filter), `from` / `to` (ISO 8601), `limit` (default 5000, max 5000). |
| `PATCH /v1/timeentry/:id`           | yes (`authKey`) | Partial update. Updatable: `teDescription`, `teStartedAt`, `teEndedAt`, `teBillable`. `teMinutes` is recomputed on bound change. |
| `DELETE /v1/timeentry/:id`          | yes (`authKey`) | Soft-delete (sets `teArch = true`). Entries are never physically removed via the API. |
| `* /v1/worker/*`                    | yes (`authKey`) | Full CRUD for Workers (`workerId`, `workerFName`, `workerLName`, `workerTitle`, `workerDefaultBillType`, `workerCompId`, `workerArch`). Direct company scoping via `workerCompId`. Endpoints: `POST /v1/worker`, `GET /v1/worker/:id`, `GET /v1/worker/bycompany/:id`, `PATCH /v1/worker/:id`, `DELETE /v1/worker/:id`. |
| `* /v1/billingtype/*`               | yes (`authKey`) | Full CRUD for BillingTypes (hourly rates a Worker can default to). Same shape as Worker. |
| `* /v1/inventoryitem/*`             | yes (`authKey`) | Full CRUD for InventoryItems. Same shape as Worker. |
| `* /v1/company/*`                   | yes (`authKey`) | Companies. Master keys only for `POST /v1/company`, `DELETE /v1/company/:id`, and `GET /v1/company` (list); non-master keys may `GET /v1/company/:id` and `PATCH /v1/company/:id` for their own row only. |
| `* /v1/job/*`                       | yes (`authKey`) | Jobs (customer-scoped via `jobCustId` → `custCompId`). Endpoints: `POST`, `GET /:id`, `GET /bycustomer/:id`, `PATCH /:id`, `DELETE /:id`. |
| `* /v1/invoice/*`                   | yes (`authKey`) | Invoices (customer-scoped). Same shape as Job. |
| `* /v1/customerpayment/*`           | yes (`authKey`) | Customer payments (customer-scoped). `GET /bycustomer/:id` lists newest first. |
| `* /v1/invoicejob/*`                | yes (`authKey`) | Invoice line items (job-scoped via `injbJobId` → Job → Customer.custCompId). `GET /byinvoice/:id` lists per invoice. |
| `* /v1/productentry/*`              | yes (`authKey`) | Product entries consumed on a Job (job-scoped). `GET /byjob/:id` lists per job. |
| `* /v1/versioninfo/*`               | yes (`authKey`) | Schema/build version records. Reads open to any `authKey`; mutations require a master key. `DELETE` is a hard destroy (no archive column on this table). |
| `* /v1/purchaseordervendor/*`       | yes (`authKey`) | Vendors that POs are issued to. Direct company scoping via `povCompId`. Standard CRUD + `bycompany`. |
| `* /v1/purchaseorderheader/*`       | yes (`authKey`) | Purchase orders. Vendor-scoped — auth resolves via `pohPovId → vendor.povCompId`. `GET /byvendor/:id` lists POs for a vendor, newest first. |
| `* /v1/purchaseorderline/*`         | yes (`authKey`) | PO line items. Header-scoped via `polpoh → header → vendor → company`. `GET /byheader/:id` lists line items on a PO. |
| `* /v1/inventorytransaction/*`      | yes (`authKey`) | Inventory movement log. Direct company scoping via `invtCompanyId`. `invtDirection` is `0` (inbound) or `1` (outbound). PATCH/DELETE exposed for surface parity; audit-grade deployments may want to disable them at the proxy. |
| `POST /v1/<entity>/bulk`            | yes (`authKey`) | Transactional all-or-nothing bulk-create on all 13 soft-deletable entities (customer, worker, billingtype, inventoryitem, inventorytransaction, purchaseordervendor, job, invoice, customerpayment, invoicejob, productentry, purchaseorderheader, purchaseorderline). Body: `{ <entityKey>: [{...}, ...] }` capped at 500 entries. Same auth scoping as the single-create POST. If any entry fails to insert, the whole batch rolls back. |

### Cross-cutting headers + behaviors

- **`Idempotency-Key` (request header, optional)** — set on any POST to make it
  idempotent for 24h. Identical retry replays the cached response with
  `Idempotency-Replay: true`. Same key + different body → `409
  { code: "idempotency_key_reused" }`. Printable ASCII, 1-255 chars.
- **`Link` (response header, RFC 5988)** — every paginated list endpoint emits
  `next` / `prev` / `first` / `last` URLs when applicable, so clients can walk
  the result set without doing offset arithmetic.
- **`X-Request-Id` (response header, also accepted on request)** — every
  response carries a UUID correlator; the same id appears in every structured
  log line for that request. Supply your own X-Request-Id on the way in to
  propagate trace context from a reverse proxy / mesh.
- **`RateLimit-*` (response headers, RFC standard)** — `RateLimit-Limit`,
  `RateLimit-Remaining`, `RateLimit-Reset` on every /v1/* response.
- Browser JS reading any of the above on a cross-origin response works
  out-of-the-box: the CORS layer's `Access-Control-Expose-Headers` covers them.

Every v1 request must include the API key in the `authKey` HTTP header.
The `/healthz` endpoint is intentionally unauthenticated so it can be
hit by orchestrators (Docker `HEALTHCHECK`, Kubernetes liveness, uptime
monitors) without sharing a credential.

![example image](https://github.com/CryptoJones/TimeTrackerAPI/blob/master/setup/postman_example.PNG?raw=true)

*(authKey example using Postman)*

A pre-built Postman collection covering every endpoint lives at
[`setup/TimeTrackerAPI.postman_collection.json`](setup/TimeTrackerAPI.postman_collection.json).
Import it via Postman → File → Import. Generated from the
`/openapi.json` spec via [`openapi-to-postmanv2`](https://github.com/postmanlabs/openapi-to-postman),
so it stays in sync with whatever the server actually serves —
regenerate after API changes with:

```bash
node -e "require('fs').writeFileSync('/tmp/oas.json', JSON.stringify(require('./app/config/openapi.js')))" && \
    npx --yes openapi-to-postmanv2 -s /tmp/oas.json -o setup/TimeTrackerAPI.postman_collection.json -p
```

---

## Requirements

- **Node.js 20+** (matches `engines.node` in `package.json`; CI tests against 20 and 22)
- **PostgreSQL 14+**
- A modern Linux distribution (any currently supported LTS — Ubuntu 22.04 / 24.04, Debian 12, RHEL 9, etc.)

---

## Quick start

### Docker (one-line)

```bash
git clone https://github.com/CryptoJones/TimeTrackerAPI.git
cd TimeTrackerAPI
cp .env.example .env
# edit .env: at minimum set DB_PASSWORD
docker compose up --build
```

This brings up postgres + the schema bootstrap (both SQL files) + the
API on port 3000. `GET http://localhost:3000/healthz` should return
`{"status":"ok",...}` within ~15 seconds.

### Bare-metal

```bash
# 1. Clone
git clone https://github.com/CryptoJones/TimeTrackerAPI.git
cd TimeTrackerAPI

# 2. Install dependencies (no sudo)
npm install

# 3. Provision the database
sudo -u postgres psql <<'SQL'
CREATE USER timetracker WITH PASSWORD 'change-me-strong-password';
CREATE DATABASE timetracker WITH OWNER timetracker;
SQL
sudo -u postgres psql -d timetracker -f setup/TimeTracker.sql
sudo -u postgres psql -d timetracker -f setup/TimeEntry.sql

# Record the baseline as the migration starting point
npm run migrate

# 4. Configure environment
cp .env.example .env
$EDITOR .env       # set DB_PASSWORD, optionally PORT / CORS_ORIGIN

# 5. Run
npm start
```

The server listens on `http://0.0.0.0:3000` by default. No root required.

### Behind TLS (production)

The repo ships an opt-in TLS reverse-proxy layer using Caddy in
`docker-compose.tls.yml`. Caddy handles automatic Let's Encrypt
provisioning + renewal, HTTP→HTTPS redirect, and HTTP/2 +
HTTP/3 on :443. The api service is rebound off the host port so
Caddy is the only thing the public reaches.

```bash
# In .env: set DB_PASSWORD, TLS_DOMAIN (your FQDN), and TLS_EMAIL.
sudo docker compose \
    -f docker-compose.yml \
    -f docker-compose.tls.yml \
    up -d
```

For local TLS testing set `TLS_DOMAIN=localhost`; Caddy uses its
built-in CA (self-signed) instead of ACME. Don't combine
`docker-compose.tls.yml` with `docker-compose.override.yml` on a
public host — the override exposes Postgres on :5432.

---

## Testing

```bash
npm test            # unit + API suite (mocks the DB; no infra needed)
npm run test:watch  # vitest watch mode
```

For integration tests against a real Postgres — see
[`tests/integration/README.md`](tests/integration/README.md).
Short version:

```bash
cp .env.example .env   # set DB_PASSWORD
sudo docker compose up -d postgres setup migrate
DB_HOST=localhost DB_PORT=5432 DB_NAME=timetracker \
    DB_USER=timetracker DB_PASSWORD=$(grep ^DB_PASSWORD= .env | cut -d= -f2-) \
    npx vitest run tests/integration
sudo docker compose down -v   # cleanup
```

The committed `docker-compose.override.yml` exposes Postgres on
`127.0.0.1:5432` for these host-side test runs; without it the
postgres container is reachable only from other compose services.

---

## Environment variables

All configuration lives in environment variables (loaded from `.env`
locally via `dotenv`, or set directly by your process manager in
production). See `.env.example` for the canonical reference.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | (unset) | Set to `production` to enable strict startup checks (e.g. refuse to start when `DB_PASSWORD` is empty). |
| `PORT` | `3000` | HTTP listen port. Use a non-privileged port (>1024). `0` asks the kernel to pick a free port. |
| `HOST` | `0.0.0.0` | Bind address. `127.0.0.1` for localhost-only. |
| `CORS_ORIGIN` | (unset → disabled) | Comma-separated list of allowed origins, e.g. `https://app.example.com,https://admin.example.com`. Leave unset to disable cross-origin requests entirely. |
| `TRUST_PROXY` | (unset → off) | When the API runs behind nginx/caddy/cloudflare, set to `true` (trust any proxy) or a hop count (`1`) so rate-limit and log IPs resolve to the real client. Never set when the API is directly internet-facing. |
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_NAME` | `timetracker` | Database name. |
| `DB_USER` | `timetracker` | Database user (must have access to the `dbo` schema). |
| `DB_PASSWORD` | (empty) | Database password. **Required.** With `NODE_ENV=production` the server refuses to start on empty; in dev it warns and keeps going. |
| `DB_LOG_QUERIES` | (unset → off) | Set to `1` to route Sequelize query logs through pino at debug level. Off by default so SQL + bound parameters (which include hashed `authKey` values) don't escape pino's redact paths. |
| `LOG_LEVEL` | `info` | pino log level: `trace`/`debug`/`info`/`warn`/`error`/`fatal`/`silent`. |
| `LOG_PRETTY` | (unset → JSON) | Set to `1` for human-readable colorized output via pino-pretty (dev only — leave unset in production so log shippers get the structured JSON they expect). |
| `JSON_BODY_LIMIT` | `100kb` | Max request body size for `express.json()`. Accepts the same forms as the `bytes` module (e.g. `512kb`, `1mb`). Bumping is rarely needed — the largest schema-allowed body is well under the default. |
| `HELMET_CSP` | (unset → off) | Set to `1` to re-enable helmet's Content-Security-Policy. Off by default because this is a JSON API and a misconfigured CSP would break Swagger UI at `/docs`. |
| `RATE_LIMIT_MAX` | `100` | Per-key request budget for `/v1/*` in the rolling window. Set to `0` to disable rate limiting entirely (e.g. for load tests). |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rolling rate-limit window in milliseconds (default 15 min). |
| `METRICS_BEARER_TOKEN` | (unset → open) | When set, the Prometheus scrape at `/metrics` requires `Authorization: Bearer <token>`. Leave unset for a private-network deployment where the reverse proxy gates exposure. Constant-time compared. |
| `PUBLIC_BASE_URL` | (unset) | Canonical `scheme://host` the API is publicly reachable at. Used as the base for absolute URLs in the RFC 5988 `Link` header (pagination next/prev/first/last). Pin in production so a client sending a malicious `Host` header can't get it echoed back. Unset = derive from `req.protocol` + `req.get('host')`. |
| `SHUTDOWN_TIMEOUT_MS` | `25000` | How long the graceful-shutdown drain may run before the server force-exits with code 1 — set this under whatever your orchestrator's `SIGTERM`→`SIGKILL` window is (k8s default is 30s). |
| `TLS_DOMAIN` | (unset) | Required for `docker-compose.tls.yml`. Domain Caddy provisions a Let's Encrypt cert for; `localhost` gives a self-signed cert via Caddy's internal CA. |
| `TLS_EMAIL` | (unset) | Optional email forwarded to Let's Encrypt for cert-expiry notices. |

`.env` is gitignored. Never commit a populated `.env`.

---

## Database migrations

Schema changes after the baseline `setup/*.sql` files use
`sequelize-cli` migrations under [`app/migrations/`](app/migrations/).

```bash
npm run migrate          # apply all pending migrations
npm run migrate:undo     # roll back the most recent one
npm run migrate:status   # show what has and hasn't been applied
npm run migrate:generate add-new-column   # scaffold a new migration
```

See [`app/migrations/README.md`](app/migrations/README.md) for the
authoring conventions (schema-qualify `dbo`, always provide a `down`,
no model references in migration code, etc.).

## Security notes

- **Do not run this service as root.** The default port (`3000`) is
  non-privileged on purpose. If you need to expose the API on `:443`,
  put nginx, Caddy, or another reverse proxy in front and terminate TLS
  there.
- **Rotate the `authKey` regularly** and limit which users have access
  to the `apikey` / `apimaster` tables.
- **Use a strong, unique `DB_PASSWORD`** and restrict the database user
  to the minimum required privileges — `SUPERUSER` is convenient for
  local development but should not be the production grant.

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
