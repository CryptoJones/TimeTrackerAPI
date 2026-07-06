<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Aaron K. Clark -->

# Adversarial security & correctness review — log

A record of a focused, subsystem-by-subsystem adversarial review of the
codebase: what was examined, what was fixed, what was verified sound, and
the **open items that need a design decision** rather than a code change.
It complements [`SECURITY-POSTURE.md`](SECURITY-POSTURE.md) (the control
inventory) and [`ARCHITECTURE.md`](ARCHITECTURE.md) (how the system fits
together).

## Method

Each subsystem was read adversarially against its own tests, with every
reported finding **reproduced by executing the real code** before it was
accepted, and every fix landed with a regression test. The review targeted
the highest-stakes surfaces first (money, auth, data egress) and treated a
plausible-but-unproven finding as not-a-finding.

## Fixes shipped

| Subsystem | Finding | Severity | PR |
|---|---|---|---|
| Webhooks (SSRF) | Tenant `whkUrl` fetched with only a structural check → **SSRF** to cloud metadata / loopback / private hosts (redirect-following bypass; `ping` status oracle); added a resolved-IP denylist + scheme pin + per-hop redirect re-validation (`ssrf-guard.js`) | **High** | #573 |
| Invoice lines (cross-tenant) | `injbInvId` unchecked on InvoiceJob create/bulk → a scoped caller attaches a line + amount to **another tenant's invoice** (renders on their PDF; victim can't delete it); added `getCompanyIdByInvId` / `invoiceFkBelongsTo` (secondary-FK class, cf. inventory #571) | **High** | #578 |
| Worker rate-source FKs (cross-tenant) | `workerDefaultBillType`/`workerRoleId` unchecked on create/update/bulk → a scoped caller points a worker at **another tenant's BillingType/Role**, pulling a foreign rate into billing (`rate.js` reads them); added `billingTypeFkBelongsTo`/`roleFkBelongsTo`. Found by a **systematic FK audit of every controller** (the audit confirmed all other controllers sound) | **High** | #579 |
| CustomerPayment bulk allocation | Single create checks `cpayInvId` is a **same-customer** invoice; the **bulk** path skipped it → cross-tenant AR allocation (corrupts another customer's balance/aging). Added a per-entry allocation check via a new bulk `perEntryCheck` hook | Med-High | #580 |
| Payment / line amounts (DoS) | Unbounded `cpayAmount` / `injbAmount` → a finite-huge value overflows `money.toCents()` to **Infinity** → uncaught throw → 500 across a company's whole AR aging; magnitude-bounded (negatives still allowed) | Med | #578 |
| Idempotency | Unbounded `canonicalJson` → **pre-auth process-crash DoS** (the author's fix `580109b` had never been merged to `main`); depth-bounded → 400, async mount hardened | **High** | #558 |
| Invoice PDF | Unbounded line count × long unbroken `jobDesc` → pdfkit superlinear word-fit **froze the event loop** (~6 s/req) — one authed request stalled the whole server; descriptions/notes clipped, line count capped | **High** | #568 |
| Report PDF | Same pdfkit **event-loop-stall DoS** in `report-pdf.js` `drawTable` (uncapped rows × caller-controlled `custName`, ~9 s/req); cells clipped, rows capped | **High** | #569 |
| Time-lock | Closed-period lock **bypass** via a timezone offset in `teStartedAt` (string bucketed to wall-clock day, `Date` to UTC) | High | #555 |
| Dunning | Over-dunning: a **write-off** was ignored (forgiven invoice dunned in full) and the default run flagged **due-today** as overdue (a #556 side effect); now settles `total−collected−writeOff` and requires `dueDate < today` | Med | #577 |
| Billing gate | Invoice rollup ignored approval status → a reviewer-**rejected** entry still billed the client; rollup now excludes `teApprovalStatus = 'rejected'` | Med | #566 |
| Mailer | `subject` / `from` not CR/LF-checked → **email header injection** once an SMTP transport is wired (defense-in-depth) | Med/latent | #564 |
| RBAC | `permissionsFor` threw on prototype-named roles (`__proto__`) instead of failing closed to `[]` | Low | #561 |
| JWT | `verify` accepted a token lacking `exp` (never expired) — now fail-closed | Low/DiD | #557 |
| Payroll | Labor cost computed from **2-dp display hours × rate** instead of exact `rate × minutes/60` (33–67¢/worker error) | Med | #554 |
| Reports | `weekKey` threw `RangeError` on a calendar-invalid date; dunning cutoff excluded the exact-boundary day | Low | #556 |
| Pagination | `buildLinkHeader` didn't floor `limit`/`offset` → fractional query params | Low | #559 |
| Audit trail | Right-to-erasure event logged `alogEntityId = null` (nested `/gdpr/customer/:id/...` path not matched) | Low | #562 |
| GDPR | Scrub test checked `PII_FIELDS` against itself → added a guard pinning it to the real `Customer` columns | Low | #563 |

## Verified sound (proven, not assumed)

- **Crypto/auth primitives** — JWT rejects `alg:none` and algorithm
  confusion, compares signatures in constant time, enforces `exp`; scrypt
  password verify is constant-time with a CSPRNG salt; reset/invite/share
  tokens are `randomBytes(32)` **hashed at rest**; API keys are SHA-256 at
  rest with empty-key guards.
- **Multi-tenant scoping** — single-entity cross-tenant access is a
  secure-404; the scope id comes from the auth context, never a client
  param; the #374 rollout removed the duplicate per-request lookup without
  changing any scope decision.
- **Compliance data path** — GDPR export is tenant-scoped; the PII scrub is
  column-complete vs the `Customer` DDL; **no secret can reach the audit
  log** (it stores metadata only — no body, no field diff); the audit read
  is company-scoped.
- **Share links** — the public read loads its resource by the **signed
  JWT's** id (not a client param), so a token can't be pivoted cross-tenant;
  expiry is enforced on read; the projection is field-whitelisted; an
  invalid token 404s uniformly with no forgeable oracle.
- **Approval state machine** — every `(status × action)` transition was
  proven: double-approve, reject-of-approved, and skip-submit all 409; an
  `approved` entry is frozen against **both** edit and delete, and because
  `reject` is illegal from `approved` there is no unlock-then-edit path; the
  approval endpoint is secure-404 scoped. (The chain/authz gaps are open
  items 6–8 below.)
- **CSV export** — every data cell routes through the formula-injection
  escaper (`buildCsv` is the single, unit-tested assembly seam), the header
  row is a trusted constant, the download filename id is `Number`-validated,
  and an embedded newline stays quoted per RFC 4180 — no injection vector.
- **Invoice/report PDF** — after the render-bound fixes, empty/partial data
  degrades gracefully (no throw), the filename is sanitised to
  `[A-Za-z0-9._-]` (no header injection), `fmtMoney` is null-safe, and no
  server path or secret is embedded in the PDF metadata.
- **Expenses / receipts** — markup is exact via `money.js` (single
  cent-round); the roll-up is billable-only + un-invoiced + company-scoped
  and stamps `expInvId` in a transaction (no double-bill); receipt bytes are
  a Postgres `bytea` (no disk write → no path traversal); the upload is
  triple-bounded (100kb body → 10M-char schema → 5MB decoded); content-type
  is an enum served as an `attachment` with `nosniff` (SVG/HTML rejected).
- **Route guarding (systematic audit)** — all **225** route registrations in
  `router.js` audited: `attachAuth` is on `/v1` (and nothing is registered
  outside `router.js`), every scoped handler self-enforces the `authKey` +
  company scope (inline or via `findScoped` / `resolveCompany` / the bulk
  factories), every `:id` route carries `v.params(intIdParam)` (no NaN id
  reaches `findByPk`), every create/update/bulk a `.strict()` `v.body` (or
  reads no body), and every list/report a `v.query`. The deliberately-public
  routes (health / metrics / openapi, `whoami`, `login` / password-reset /
  invite-accept / signed share-link read) leak nothing sensitive
  (`safeUser` / `safeView` projections, anti-enumeration 401/200). No
  unauthenticated path, missing/wrong validation, or wrong-schema wiring.
  (`user.setRole` being company-scoped rather than master-only ties to the
  RBAC-enforcement decision, open item 1.)
- **Cross-tenant FK scoping (systematic audit)** — every controller's
  create/update/bulk FKs were audited: each foreign key is either the
  scoping parent or validated against the caller's company (or same-customer,
  for payment→invoice). The three secondary-FK gaps found are fixed
  (inventory #571, invoice-line #578, worker rate-source #579) plus the
  CustomerPayment-bulk same-customer gap (#580); the one remaining unchecked
  FK — a BillableRule match-id — is **inert** (never dereferenced; rules are
  evaluated company-scoped), and every money field now carries a `.max()`.
- **Reporting aggregations** — profitability / utilization / budget / hours /
  unbilled / timesheet / targets / capacity / revenue all sum through
  `money.js`, derive hours from **exact minutes** (never pre-rounded display
  hours), and **guard every ratio's zero denominator** (`marginPct`,
  `utilizationPct`, budget/target ratios all emit `null`/`0`, never
  `NaN`/`Infinity`). Denominators/units are correct (margin `= (rev−cost)/rev`),
  buckets don't double-count, and all 11 report endpoints are company-scoped
  with `from`/`to` required where capacity depends on them.

## Open — needs a design decision (not a bug fix)

These are real gaps whose remedy is a product/architecture choice; each was
deliberately **not** implemented autonomously.

1. **RBAC enforcement — WIRED (#583).** The actor role now comes from the
   **Bearer-JWT sign-in path**: a new `attachUser` middleware resolves the
   signed-in user into `req.user = { userId, userCompId, userRole }`, and
   `usercontroller.setRole` / `user.create` / `invitationcontroller.create`
   enforce RBAC for a JWT actor — `canAssignRole` (no privilege escalation +
   `user:manage-roles`) plus `canChangeRole` (can't modify a user who
   out-ranks you), scoped to the actor's own company (secure-404). The
   **API-key path is unchanged** — a company/master key remains the tenant's
   full-authority credential (that's the deliberate model; a signed-in user
   is the constrained actor). The full user surface is now JWT-actor aware
   (#584): read (`user:read`), update (self-edit or `user:write`), remove
   (`user:write`), and `listByCompany` (own company). Remaining follow-up:
   gate the approval action the same way (open item 8).
2. **Idempotency concurrent double-execution — RESOLVED (#588).** Previously
   the cache row was written *after* the handler, so two simultaneous same-key
   requests both executed the side effect (a double-charge risk). The
   middleware now performs a **pre-handler atomic claim**: `INSERT … ON
   CONFLICT DO UPDATE … WHERE ikExpiresAt < now() RETURNING` inserts a PENDING
   row (or re-claims one left past a 5-min `PENDING_TTL`); Postgres serializes
   the conflict so exactly one request wins. The winner runs the handler and
   COMPLETEs the row on a 2xx/4xx (cached 24 h) or RELEASEs it on a 5xx /
   `res.finish` with no JSON (so a retry re-runs); a losing request with the
   same key+body gets `409 idempotency_in_progress` while the holder is live,
   replays once it completes, or `409 idempotency_key_reused` on a body
   mismatch. Nullable `ikResponseStatus`/`ikResponseBody` migration backs the
   pending state.
3. **Streamed GDPR export — RESOLVED (#589).** `exportCustomer` previously
   issued seven un-`limit`ed parallel `findAll`s and buffered the lot — an
   OOM/DoS vector for a very large customer. It now **streams** the same JSON
   object, keyset-paginating each relation (`pk > lastId` batches of 500 via
   `gdpr.streamRelationArray`) so peak memory is O(batch), not O(total rows) —
   no truncation, so GDPR completeness is preserved. A mid-stream DB error
   truncates the (already-started) response, which the client detects.
4. **Per-link share revocation — RESOLVED (#590).** Share links are stateless
   JWTs, so an individual link previously couldn't be revoked before its `exp`
   (≤90 days) short of archiving the invoice or rotating `SHARE_SECRET` (which
   kills *every* link). Each minted link now carries a random `jti`; a new
   tenant-scoped `POST /v1/share/revoke` (present the token → verify invoice
   ownership → deny-list the jti in the `RevokedShareLink` table), and the
   public view rejects a deny-listed jti with the same 401 as an invalid token
   (no revocation-status leak). Revoke is idempotent; legacy pre-`jti` tokens
   aren't individually revocable (400) — rotate the secret for those.
5. **Master actions in the tenant audit trail** (informational). A master
   key's mutations set `alogCompId = null`, so they don't appear in the
   affected company's audit view — a completeness gap, not a leak.
6. **Multi-level approval chain — ENFORCED (#591).** A new
   `TimeEntry.teApprovalLevel` counter tracks how many of the company's
   active chain's levels an entry has cleared. For a signed-in (JWT) actor,
   each `approve` now runs `approval-chain.canApproveAt` (their role must
   satisfy the next required level) and advances one level via `nextStep`;
   the entry stays `submitted` until the final level clears, only then
   `approved`. submit/reject reset the counter to 0. An API key keeps full
   authority (one approve → approved, chain marked cleared); a company with
   no active chain is unchanged. The company's active chain (lowest `apchId`
   if several) governs.
7. **Approval billing gate — RESOLVED (#595).** The per-tenant decision is
   now an **opt-in** company flag, `compRequireApproval` (default **false**,
   so the approval-less flow is unchanged). When a company sets it, the invoice
   rollup bills only `approved` time — `open` / `submitted` / `rejected`
   billable time is reported back in `skipped.notApproved` rather than billed.
   Implemented in the pure `buildRollup(entries, { requireApproval })` so it's
   exhaustively unit-tested, and surfaced on `PATCH /v1/company/:id`.
8. **Approver authorization — RESOLVED (#585, #586).** The approval action
   enforces a `time:approve` permission (granted to **manager and up**) for a
   signed-in-user (JWT) actor, scoped to the actor's own company (secure-404),
   using the same `attachUser` mechanism as item 1. **Separation of duties is
   now enforced too (#586):** a nullable `workerUserId` link (Worker → User,
   tenant-checked like every other FK) lets the approval action reject a user
   approving their **own** logged time (the entry's worker resolves to the
   acting user) with a 403. The API-key path stays full-authority. Remaining
   product knob: the approve tier defaults to `manager+` (adjustable), and
   the `workerUserId` link is populated by whoever provisions workers.
9. **Process-level safety net — RESOLVED (#594).** `server.js` now installs
   `app/config/process-safety.js`: an `unhandledRejection` is **logged** (and
   the process continues — a stray missed `.catch` shouldn't drop every
   in-flight connection), while an `uncaughtException` is **logged then
   `exit(1)`** so a supervisor restarts a clean process (state may be corrupt
   after an uncaught throw). Both reviews confirmed **no live escape path**, so
   this is defense-in-depth. The policy is documented as adjustable (an
   operator preferring fail-fast can flip the rejection branch).
10. **Rate snapshot — RESOLVED (#593).** `resolveHourlyRate` read the
    *current* rate sources at invoice/report time, so editing a rate
    retroactively re-priced a not-yet-invoiced backlog. A new nullable
    `TimeEntry.teRateSnapshot` freezes the rate resolved when the entry is
    created (via `snapshotEntryRate` on create / timer-start / copy, using the
    shared `rateSourceInclude`), and `resolveHourlyRate` now prefers the
    snapshot over live resolution — so a later rate-source edit can no longer
    re-price the entry. A null snapshot (no rate resolvable at creation) still
    falls through to live. **Follow-up still open**: full effective-dating
    driven through `rate-schedule.js#rateOnDate(entryDate)` — the snapshot
    covers the retroactive-re-pricing risk without the schedule wiring.
11. **Archiving a rate source silently re-rates entries to a lower tier**
    (rate review, MED). Soft-deleting a referenced rate source (e.g. a
    per-entry `BillingType` override) makes the `required:false` +
    `defaultScope` join return `null`, so `resolveHourlyRate` falls through
    to the next tier instead of flagging — a silent under-bill. The right
    behavior (fall through vs. flag `unresolvedRate` vs. block the archive)
    is a billing-policy choice, so it was not changed autonomously. (The
    `DOUBLE`-vs-`NUMERIC` storage inconsistency — `btHourlyRate`, `cpayAmount`,
    `injbAmount` — was **resolved in #587**: all three are now `NUMERIC(14,2)`
    with a Number getter, so every money column is exact-decimal at rest.
    Remaining minor: `$0` is only settable at the BillingType tier — a
    validation-symmetry choice.)
12. **Team utilization mixes numerator/denominator populations** (reporting
    review, LOW / by-design). Team `utilizationPct = teamBillable /
    teamCapacity`, but the numerator sums **all** workers' billable minutes
    while the denominator only adds capacity for workers **with** a
    `targetMinsPerWeek` — so an untargeted worker inflates the team figure,
    which can exceed 100% and every per-worker row. This is currently
    **intended** (asserted in `capacity.test.js`), but whether a team metric
    should be able to exceed 100% is a reporting-semantics decision (exclude
    untargeted workers from the numerator, or assume a default capacity).
    The rest of the reporting layer was verified sound (above).

---

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
