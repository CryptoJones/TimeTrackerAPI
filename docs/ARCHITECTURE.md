<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Aaron K. Clark -->

# Architecture & conventions

How TimeTrackerAPI is put together, and the patterns to follow when
extending it. This is the *design* companion to
[`CONTRIBUTING.md`](../CONTRIBUTING.md) (the contribution *workflow*) and
[`README.md`](../README.md) (how to run it and the endpoint catalogue).
For the security control inventory see
[`docs/SECURITY-POSTURE.md`](SECURITY-POSTURE.md); every architectural
decision also carries a one-paragraph rationale in
[`CHANGELOG.md`](../CHANGELOG.md).

## What it is

A stateless **Node + Express** JSON API over **Sequelize 6 / PostgreSQL**,
serving a multi-tenant consultant **time-tracking → billing → payments**
domain. No server-side sessions: every request authenticates with an API
key header. The process is horizontally scalable — all state lives in
Postgres. It ships with an ops layer (OpenAPI/Swagger, `Idempotency-Key`,
RFC-5988 pagination, rate limiting, structured logging, Prometheus
`/metrics`, health probe, Docker/Caddy-TLS).

Runtime dependencies are deliberately lean: password hashing (scrypt), JWTs
(HS256), and key hashing (SHA-256) are all built on Node's stdlib `crypto`
— there is **no external crypto/auth dependency** to audit or patch.

## Directory layout

```
server.js              Process entry: middleware chain, listen, graceful shutdown
app/
  config/              db.config.js (Sequelize init + ALL model associations),
                       env.js, logger.js (pino), openapi.js, sequelize-cli.config.js
  middleware/          auth.js, validate.js, error-handler.js, idempotency.js,
                       audit.js, metrics.js, pagination.js, rate-limit-key.js, redact-url.js
  routers/             router.js — mounts /v1 (+ attachAuth), /docs, /metrics, /healthz
  controllers/         one per resource; thin HTTP glue over models + services
  models/              Sequelize model definitions (one per table)
  schemas/             zod strict-whitelist request schemas (one per resource)
  services/            pure domain logic — no req/res, unit-testable in isolation
  migrations/          sequelize-cli migrations (the ONLY way the schema evolves)
  seeders/             sequelize-cli seed data
setup/                 frozen baseline SQL used by the docker `setup` bootstrap
tests/                 unit/ + api/ + integration/ tiers (vitest)
```

## Request lifecycle

Outer chain, in `server.js`, wraps every request:

```
pino-http (request log) → helmet (headers) → cors → express.json (body)
  → v1Limiter (rate limit, /v1 only) → metrics → router → notFound → errorHandler
```

Inside `app/routers/router.js`, the `/v1` surface adds:

```
router.use('/v1', attachAuth)   // resolves + caches auth context on req
router.use('/v1', auditLog)     // stamps the audit trail
```

- **`attachAuth`** resolves the caller once and sets `req.isMaster` /
  `req.companyId` on the request. A genuine DB outage here answers **503**,
  not a misleading 403 (a bad key still collapses to the `-1` sentinel).
- **`validate`** (per route) runs the resource's zod schema against
  `body` / `params` / `query` and rejects unknown fields (400) *before*
  the controller sees them.
- **Controllers** are thin: authorize → validate FK/tenant links → call a
  model or service → shape a fixed response envelope.
- **`error-handler`** is the single place allowed to turn a thrown error
  into a response body. Controllers never echo `error.message` to clients
  (pinned by [`tests/unit/controller-error-shape.test.js`](../tests/unit/controller-error-shape.test.js)).

## Multi-tenancy & authorization

Two key tiers, both SHA-256-hashed at rest:

- **Master key** (`ApiMaster`) — cross-tenant; may target any company by
  passing an explicit `*CompId` in the body.
- **Company key** (`ApiKey`) — scoped to one company; the server derives
  the company id and refuses to act outside it.

`app/middleware/auth.js` is the one authority. It exposes a family of
resolvers — pick the one that matches how the entity reaches a company:

| Resolver | Use when the entity is scoped… |
|---|---|
| `getCompanyId(authKey)` | directly by the key's own company |
| `getCompanyIdByCustomerId(id)` | through a `Customer` |
| `getCompanyIdByJobId(id)` | through a `Job` |
| `getCompanyIdByPovId` / `getCompanyIdByPohId` | through a PO vendor / header |

**Reuse the resolved context (#374).** Controllers must call
`auth.masterFromReq(req, authKey)` / `companyIdFromReq(req, authKey)`,
which return the `req.isMaster` / `req.companyId` that `attachAuth` already
resolved (falling back to a live lookup only when the context is absent,
e.g. a handler invoked directly in a unit test). A raw `isMaster(...)` /
`getCompanyId(...)` call inside a controller repeats the per-request DB
round-trip and is rejected by
[`tests/unit/attachauth-context-guard.test.js`](../tests/unit/attachauth-context-guard.test.js).
The per-entity `...By*Id` resolvers are intentionally left live —
`attachAuth` doesn't cache them.

**Response-code policy.** Cross-tenant access to a *single entity by id*
returns **404** (secure-404, so a scoped caller can't enumerate which ids
exist in other tenants); a list-by-company mismatch or invalid key returns
**403**; a bad FK / validation failure returns **400**. The full table
lives in the [README](../README.md#secure-404-on-cross-tenant-access).

## The increment-layer schema convention

The database evolves in **one direction only**:

- **`setup/*.sql` is frozen** — it is the baseline the docker `setup`
  service bootstraps, recorded as the migration starting point. Do not add
  columns or tables there.
- **Every new column or table ships as a `app/migrations/` migration**
  (`npm run migrate:generate --name …`). This keeps a fresh bootstrap and
  an upgraded database convergent.
- **Associations are centralized** in `app/config/db.config.js`, not
  scattered across model files — one place to read the whole graph.
- **Money is `DECIMAL(14,2)`** with a Number getter on the model, and all
  arithmetic goes through [`app/services/money.js`](../app/services/money.js)
  (integer-cent math) so rounding is exact and consistent.
- **Soft-delete**: models with an `*Arch` flag carry
  `defaultScope: { where: { *Arch: false } }`; archived rows are invisible
  to reads unless a call `.unscoped()`s deliberately.

## Controllers vs services

Controllers own HTTP concerns (auth, status codes, the response envelope).
Anything with real logic — rate resolution, invoice rollup, recurring
schedules, CSV/PDF shaping, payroll, capacity, approval chains — lives as a
**pure function in `app/services/`** that takes plain values and returns
plain values (no `req`/`res`). That split is why the services can be
unit-tested exhaustively without spinning up Express or Postgres.

## Validation

Request shape is enforced by **zod strict whitelists** in `app/schemas/`
(`v.body` / `v.params` / `v.query`). Strict means an unexpected field is a
**400**, never silently dropped — the client learns its request was wrong.
Keep the schema's field list and the controller's `ALLOWED_FIELDS_*` array
in step, and mirror both into `app/config/openapi.js`.

## Cross-cutting concerns

- **Idempotency** — `Idempotency-Key` on unsafe methods; the middleware
  canonicalises the JSON body (with bounded recursion) and replays the
  stored response on a repeat.
- **Pagination** — `?limit`/`?offset` with an RFC-5988 `Link` header
  (`buildLinkHeader`), capped page sizes.
- **Rate limiting** — keyed per API key on the `/v1` surface.
- **Logging** — `app/config/logger.js` (pino); never `console.*` outside
  startup. URLs are redacted before they hit the log.
- **Audit** — `middleware/audit.js` records who changed what (DCAA-grade
  entity id + field diffs on the `AuditLog`).
- **Observability** — Prometheus `/metrics`, `/healthz` liveness probe.

## Testing strategy

Three tiers under `tests/`, all run by `npm test` (vitest):

- **`unit/`** — pure services + guard-rail meta-tests.
- **`api/`** — supertest against the Express app.
- **`integration/`** — real Postgres round-trips; **auto-skips** when no DB
  is reachable, so `npm test` is green on a fresh checkout.

Two conventions worth knowing before writing tests:

- **The `_setDbForTesting(db)` seam** on `auth.js` (and `idempotency.js`)
  injects a mock db so HTTP tests can drive success paths without a real
  database. Prefer it over integration-only coverage.
- **vi.mock caveat.** A `vi.mock` of `db.config` from an ESM test does
  **not** reliably reach a controller's CommonJS `require`, and a
  controller captures `const IsMaster = auth.isMaster` at load, so
  `vi.spyOn(auth, …)` won't reach it either. Test file headers document
  the exact seams that do work — read them first.

**Guard-rail meta-tests** encode conventions as source-level assertions so
a regression fails CI instead of shipping:

- `controller-error-shape.test.js` — no controller echoes a raw error to a
  client.
- `attachauth-context-guard.test.js` — no controller re-runs the auth
  lookup `attachAuth` already did (#374).
- `default-scope.test.js` — soft-deleted rows stay invisible by default.

When you establish a new cross-cutting rule, consider pinning it the same
way.

## Conventions quick-reference

- **Response envelope**: `{ message: "<fixed string>", <entity>: … }` on
  success; `{ message: "<generic>" }` on error. Error strings are
  hardcoded, never the raw `error.message`.
- **Naming**: table-prefixed columns (`teMinutes`, `custCompId`,
  `invTotal`); PascalCase controller-local auth aliases
  (`MasterFromReq`); kebab-case service files.
- **Commits / PRs**: see [`CONTRIBUTING.md`](../CONTRIBUTING.md). Every
  change updates `CHANGELOG.md` and, if it touches an endpoint,
  `app/config/openapi.js`.
