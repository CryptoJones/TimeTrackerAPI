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
| Idempotency | Unbounded `canonicalJson` → **pre-auth process-crash DoS** (the author's fix `580109b` had never been merged to `main`); depth-bounded → 400, async mount hardened | **High** | #558 |
| Invoice PDF | Unbounded line count × long unbroken `jobDesc` → pdfkit superlinear word-fit **froze the event loop** (~6 s/req) — one authed request stalled the whole server; descriptions/notes clipped, line count capped | **High** | #568 |
| Report PDF | Same pdfkit **event-loop-stall DoS** in `report-pdf.js` `drawTable` (uncapped rows × caller-controlled `custName`, ~9 s/req); cells clipped, rows capped | **High** | #569 |
| Time-lock | Closed-period lock **bypass** via a timezone offset in `teStartedAt` (string bucketed to wall-clock day, `Date` to UTC) | High | #555 |
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

## Open — needs a design decision (not a bug fix)

These are real gaps whose remedy is a product/architecture choice; each was
deliberately **not** implemented autonomously.

1. **RBAC enforcement.** `rbac.canAssignRole` (the no-privilege-escalation
   guard) is defined and unit-tested but has **no call sites** — the
   role-write endpoints apply no cap. Wiring it needs an *enforced actor
   role* source, which the API-key/company-scoped auth model doesn't yet
   provide (the code's plan is "later, JWT-guarded routes"). Decide where
   the actor role comes from, then gate `usercontroller.setRole` /
   `user.create` / `invitationcontroller.create`.
2. **Idempotency concurrent double-execution.** The cache row is written
   *after* the handler, so two simultaneous same-key requests both execute
   the side effect (a double-charge risk); sequential retries are correctly
   deduped. The fix is a **pre-handler claim** (insert a pending row →
   conflicting request replays or 409s) with release-on-5xx / `res.finish`
   handling and a nullable-columns migration.
3. **Streamed GDPR export.** `exportCustomer` issues un-`limit`ed
   `findAll`s — an OOM/DoS vector for a very large customer. A cap conflicts
   with GDPR's completeness requirement, so it wants a **streamed** export
   rather than a truncating limit.
4. **Per-link share revocation.** Share links are stateless JWTs, so an
   individual link can't be revoked before its `exp` (≤90 days); the only
   levers are archiving the invoice or rotating `SHARE_SECRET`. Add a
   `jti` + denylist if individual revocation is required.
5. **Master actions in the tenant audit trail** (informational). A master
   key's mutations set `alogCompId = null`, so they don't appear in the
   affected company's audit view — a completeness gap, not a leak.
6. **Multi-level approval chain is not enforced.** `ApprovalChain` is a
   standalone advisory calculator; the time-entry approval action calls
   only `applyAction` (a single `teApprovalStatus` enum) and marks an entry
   fully approved on the **first** `approve`, skipping every configured
   level. Enforcing a chain needs per-level approval tracking on the entry
   (a new counter/table), not just the enum.
7. **Should approval gate billing?** After the rejected-exclusion fix,
   `open` / `submitted` time still rolls into invoices — correct for
   companies that don't use the approval feature, but a company that
   *requires* approval before billing has no such gate. Requiring
   `approved` would break the default (approval-less) flow, so which
   policy applies is a per-tenant product decision.
8. **Approver authorization / separation of duties.** The approval action
   requires only a valid company key (no role check, no "not the logged-time
   worker" check) — the same root cause as item 1 (RBAC is not enforced;
   API keys resolve to a company, not a user). Self-approval is currently
   unpreventable.
9. **Process-level `unhandledRejection` net.** There is no global
   `unhandledRejection` / `uncaughtException` handler, so an async rejection
   that escaped a handler would crash the process on Node ≥ 15. Both the
   idempotency and PDF reviews confirmed **no live escape path** (every such
   call site catches), so this is defense-in-depth — but whether an escaped
   rejection should crash-and-restart or log-and-continue is a deliberate
   operational policy choice, so no global handler was added autonomously.

---

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
