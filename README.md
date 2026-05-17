# TimeTrackerAPI

Open-source rewrite of Atbash Services' TimeTrackerAPI on **Node.js + PostgreSQL**.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Codeberg](https://img.shields.io/badge/Codeberg-CryptoJones%2FTimeTrackerAPI-2185D0?logo=codeberg&logoColor=white)](https://codeberg.org/CryptoJones/TimeTrackerAPI)
[![GitHub](https://img.shields.io/badge/GitHub-CryptoJones%2FTimeTrackerAPI-181717?logo=github&logoColor=white)](https://github.com/CryptoJones/TimeTrackerAPI)

> Mirrored on both [GitHub](https://github.com/CryptoJones/TimeTrackerAPI) and
> [Codeberg](https://codeberg.org/CryptoJones/TimeTrackerAPI). Issues filed
> on either forge are welcome; commits are pushed to both.

Working example at [node.timetrackerapi.com](http://node.timetrackerapi.com).

## Endpoints

| Endpoint                            | Auth required | Description                                  |
|-------------------------------------|---------------|----------------------------------------------|
| `GET /healthz`                      | no            | Liveness + DB-readiness probe (returns `{status, db, uptime_s, version, elapsed_ms}`; 200 ok / 503 degraded). |
| `GET /docs`                         | no            | Interactive Swagger UI for the full API. |
| `GET /openapi.json`                 | no            | Raw OpenAPI 3.0 spec (machine-readable). |
| `GET /v1/customer/:id`              | yes (`authKey`) | Single customer lookup. Master key sees all; non-master only sees customers in its own company. |
| `GET /v1/customer/bycompany/:id`    | yes (`authKey`) | Customers in a company (paginated). Master sees any; non-master only its own. Query params: `limit` (default 100, max 500), `offset` (default 0). Archived customers (`custArch = true`) are filtered out. |
| `POST /v1/customer`                 | yes (`authKey`) | Create a customer. Master key may target any `custCompId`; non-master keys can only create within their own company (and `custCompId` defaults to that). Returns 201 + the created customer. |
| `POST /v1/timeentry`                | yes (`authKey`) | Create a time entry. Body: `teCustId` (required), `teStartedAt` (required, ISO 8601), `teEndedAt` (optional — in-flight entries allowed), `teDescription`, `teBillable` (default true). `teMinutes` is computed server-side on close. |
| `GET /v1/timeentry/:id`             | yes (`authKey`) | Single time entry lookup. Company-scoped. Archived (soft-deleted) entries return 404. |
| `GET /v1/timeentry/bycompany/:id`   | yes (`authKey`) | List time entries for a company. Query params: `customerId` (filter), `from` / `to` (ISO 8601 date range on `teStartedAt`), `limit` (default 100, max 500). Ordered most-recent first. |
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

Every v1 request must include the API key in the `authKey` HTTP header.
The `/healthz` endpoint is intentionally unauthenticated so it can be
hit by orchestrators (Docker `HEALTHCHECK`, Kubernetes liveness, uptime
monitors) without sharing a credential.

![example image](https://github.com/CryptoJones/TimeTrackerAPI/blob/master/setup/postman_example.PNG?raw=true)

*(authKey example using Postman)*

---

## Requirements

- **Node.js 18+** (tested on 20 and 22)
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

---

## Environment variables

All configuration lives in environment variables (loaded from `.env`
locally via `dotenv`, or set directly by your process manager in
production). See `.env.example` for the canonical reference.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port. Use a non-privileged port (>1024). |
| `HOST` | `0.0.0.0` | Bind address. `127.0.0.1` for localhost-only. |
| `CORS_ORIGIN` | (unset → disabled) | Comma-separated list of allowed origins, e.g. `https://app.example.com,https://admin.example.com`. Leave unset to disable cross-origin requests entirely. |
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_NAME` | `timetracker` | Database name. |
| `DB_USER` | `timetracker` | Database user (must have access to the `dbo` schema). |
| `DB_PASSWORD` | (empty) | Database password. **Required.** Setting it empty will cause connection failures and a startup warning. |

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
