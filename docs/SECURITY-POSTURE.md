<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Aaron K. Clark -->

# Security posture & SOC 2 readiness roadmap

> **Scope & disclaimer.** This document is an **engineering-posture
> inventory** — it describes the technical security controls implemented
> in this codebase and maps them to the **SOC 2 Trust Services Criteria
> (TSC)** to guide a future audit. It is **not** a SOC 2 report, an
> attestation, or a claim of certification. A SOC 2 Type II attestation
> also requires organizational controls (HR, vendor management, physical
> security, formal policies) and an independent auditor observing those
> controls operating over a period — none of which a repository can
> provide on its own. For vulnerability reporting see
> [`SECURITY.md`](../SECURITY.md).

This is a companion to the "Security notes" section of the
[README](../README.md); it goes deeper and adds the compliance mapping.

---

## 1. Implemented technical controls

### 1.1 Authentication & access control

- **API-key authentication**, two tiers — a **master** key and per-company
  keys. Keys are never stored in the clear: the DB holds a **SHA-256 hash**
  (`ApiKey.akKEY`), compared in constant time (`app/middleware/auth.js`).
- **Multi-tenant isolation.** Every company-scoped read/write is filtered
  by the caller's company; single-entity cross-tenant reads return a
  **secure-404** (never "403 — exists but not yours"), which prevents
  existence enumeration across tenants.
- **User accounts + JWT sign-in** (a second, optional auth path): password
  login issues a short-lived HS256 JWT; `GET /v1/me` resolves the caller.
- **Role-based access control (RBAC).** A signed-in user (the JWT actor,
  resolved by `attachUser`) carries a role
  (`owner > admin > manager > member > viewer`) with a cumulative permission
  matrix and a no-privilege-escalation rule (`app/services/rbac.js`),
  **enforced** across the user-management, invitation, and approval surfaces —
  including **separation-of-duties** (a user cannot approve time logged by the
  worker linked to them) and **multi-level approval chains** that must clear
  each configured level in order. An API key stays the tenant's full-authority
  credential; a signed-in user is the constrained actor.
- **Credential lifecycle.** Password reset (hashed, expiring one-time
  tokens), API-key rotation/lifecycle, and teammate invitations (hashed,
  expiring tokens that provision a user at a chosen role).

### 1.2 Data protection & privacy

- **Secrets are write-only.** Password hashes and reset/invite token
  hashes are excluded from every response projection (`SAFE_ATTRS` /
  `safeView`); a strict controller-shape test forbids echoing raw errors.
- **Password hashing** uses `scrypt` with a per-password random salt
  (`app/services/password.js`); verification is constant-time.
- **GDPR data-subject rights.** Per-customer **data export** (portable JSON,
  **streamed** in bounded keyset-paginated batches so a very large customer
  can't exhaust process memory) and **erasure** (PII scrubbed, financial
  records retained, row archived) — `app/controllers/gdprcontroller.js`.
- **Revocable share links.** Client-facing invoice links are signed, expiring
  HS256 tokens carrying a `jti`, so an individual leaked link can be
  **revoked** before it expires (`RevokedShareLink`) without rotating the
  shared secret and invalidating every link.
- **Exact money.** All monetary math goes through an exact-decimal money
  service (no float drift; every money column is `NUMERIC(14,2)`) — supports
  processing-integrity claims on billing.

### 1.3 Auditing & logging

- **Append-only audit log** of every successful mutation — actor, method,
  path, entity, status (`app/middleware/audit.js`).
- **DCAA-grade audit trail** — the touched record id (auto-stamped), a
  before/after field diff (`alogChanges`), and a justification field, with
  a queryable trail filterable by entity / actor / date window.
- **Structured logging** via `pino`; a Prometheus `/metrics` endpoint and
  health/readiness probes for observability.

### 1.4 Input validation & injection defense

- **Strict-whitelist validation** on every request body/params/query
  (Zod `.strict()`) — unknown fields are rejected, not ignored.
- **Parameterized queries** throughout (Sequelize) — no string-built SQL.
- **CSV formula-injection defense** — every exported cell is quote-wrapped
  and formula-trigger characters (`= + - @` tab/CR) are neutralized
  (OWASP-recognized class) — `app/controllers/_csv-escape.js`.
- **Request-body size limits** (`JSON_BODY_LIMIT`) bound resource use.

### 1.5 Operational & supply-chain security

- **Rate limiting** on the `/v1` surface to blunt API-key brute forcing.
- **Idempotency with a concurrency guarantee.** `Idempotency-Key` retries are
  safe, and a **pre-handler atomic claim** ensures two *concurrent* same-key
  requests can never both run the side effect (no double-charge) — exactly one
  wins and the other replays the cached response.
- **Process safety net.** A global handler logs escaped async rejections (and
  continues) and logs-then-exits on an uncaught exception for a clean
  supervised restart; the server drains in-flight requests on `SIGTERM`/`SIGINT`.
- **SSRF defense** — outbound webhook/notification URLs are validated against
  a guard that blocks private / loopback / link-local targets (including
  IPv4-mapped IPv6) before any request is made.
- **Dependency-free cryptography** — auth, JWT, webhook signing, and
  token hashing use Node's built-in `crypto`, minimizing the third-party
  attack surface. **Snyk** scans the manifest in CI on every change.
- **TLS at the edge** via the bundled Caddy config; the app runs as a
  non-root user in the container.

### 1.6 Change management

- **Feature-branch + pull-request** workflow — no direct commits to the
  default branch; every change is reviewed and CI-gated.
- **CI** runs the full test suite on Node 20.x + 22.x plus a security
  scan before merge; schema changes ship as reversible **migrations**.

---

## 2. SOC 2 Trust Services Criteria mapping

| TSC category | Addressed by (this codebase) | Maturity |
|---|---|---|
| **CC — Security (Common Criteria)** | API-key + JWT auth, RBAC, secure-404 isolation, rate limiting, strict input validation, injection defenses, Snyk/CI gating | **Strong (technical)** |
| **CC — Change management** | Branch+PR, CI matrix, reversible migrations, audit log | **Strong** |
| **CC — Monitoring** | Audit log + DCAA trail, pino logs, `/metrics`, health probes | **Moderate** (no central SIEM/alerting yet) |
| **A — Availability** | Health/readiness probes, `/metrics`, rate limiting, Docker/Caddy deploy | **Moderate** (no documented backup/DR or SLA) |
| **C — Confidentiality** | Hashed secrets, write-only projections, TLS, multi-tenant scoping | **Strong (in transit / app-layer)**; encryption-at-rest is deploy-config |
| **PI — Processing Integrity** | Exact-money service, idempotency keys, strict validation, migrations | **Strong** |
| **P — Privacy** | GDPR export/erase, PII redaction, minimal PII retention | **Moderate → Strong** |

---

## 3. Readiness roadmap (gaps → next steps)

Prioritized technical gaps between today's posture and audit-ready:

1. **SSO / MFA** (#449) — OAuth/SAML sign-in and multi-factor for
   privileged accounts. *High.*
2. **Populate `alogChanges`** — wire per-controller before/after snapshots
   into the DCAA trail (the #462 schema + diff primitive are in place).
   *High.*
3. **Encryption at rest** — document + template the DB/volume encryption
   and a KMS-backed secrets flow (env-var secrets are the current
   baseline). *High.*
4. **Centralized log aggregation + alerting** — ship pino logs to a SIEM;
   alert on auth failures / rate-limit trips. *Medium.*
5. **Backup & disaster recovery** — documented, tested restore procedure
   and RPO/RTO targets. *Medium.*
6. **Access reviews & least-privilege** — periodic review of API keys and
   user roles; automatic key expiry/rotation reminders. *Medium.*
7. **Formal policies** — incident response runbook, vendor management,
   data-retention schedule, secure-SDLC policy. *Organizational.*
8. **Independent testing** — a third-party penetration test and a
   dependency-provenance (SBOM) attestation. *Organizational.*

Items 1–4 are code/config the project can drive; 5–8 are largely
organizational and outside this repository's boundary.

---

## 4. References

- [`SECURITY-REVIEW-LOG.md`](SECURITY-REVIEW-LOG.md) — adversarial review
  log: findings fixed, controls verified sound, and the open items awaiting
  a design decision.
- [`SECURITY.md`](../SECURITY.md) — vulnerability disclosure policy.
- [`README.md`](../README.md) — "Security notes" section.
- [`CHANGELOG.md`](../CHANGELOG.md) — per-release control history.
- AICPA SOC 2 Trust Services Criteria (2017, rev. 2022).

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
