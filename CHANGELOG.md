# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
