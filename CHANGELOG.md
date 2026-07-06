# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Opt-in approval billing gate (#595).** A new company flag
  `compRequireApproval` (default `false`) makes the invoice rollup bill **only
  `approved` time** — `open`/`submitted`/`rejected` billable time is reported
  back in `skipped.notApproved` instead of billed. Off by default, so the
  approval-less flow is unchanged; settable via `PATCH /v1/company/:id`.
  Resolves review-log item 7.
- **Process-level safety net for escaped async errors (#594).** `server.js`
  installs global handlers: an `unhandledRejection` is logged and the process
  continues (a stray missed `.catch` shouldn't drop in-flight connections),
  while an `uncaughtException` is logged then triggers `exit(1)` so a
  supervisor (systemd/k8s/docker) restarts a clean process. Defense-in-depth —
  no known live escape path. Resolves review-log item 9.
- **Time entries snapshot their billing rate at creation (#593).** A new
  nullable `TimeEntry.teRateSnapshot` freezes the hourly rate resolved when an
  entry is created (also on timer-start and copy); `rate.js#resolveHourlyRate`
  now prefers the snapshot over walking the live rate sources. Editing a rate
  (billing type, job flat rate, client rate card, role rate, task rate) no
  longer retroactively re-prices a not-yet-invoiced backlog. An entry with no
  resolvable rate at creation stores `null` and falls through to live
  resolution. Resolves review-log item 10.

## [1.1.0] - 2026-07-06

The first feature release on top of the 1.0.0 backend baseline: a complete
track → bill → get-paid platform (invoicing, payments, expenses, retainers,
reporting), self-service auth with RBAC, an approval workflow, and a
sustained security-hardening pass. All changes are backward-compatible — the
API-key path is unchanged; new behavior is additive or gated on the new
signed-in-user (JWT) actor.

### Added
- **Multi-level approval chains are now enforced (#591).** Previously an
  `ApprovalChain` was advisory — the first `approve` fully approved a
  timesheet, skipping every configured level. A new `TimeEntry.teApprovalLevel`
  counter tracks cleared levels: for a signed-in (JWT) actor each `approve`
  checks their role against the next required level (`canApproveAt`) and
  advances one step; the entry stays `submitted` until the final level clears,
  only then `approved`. submit/reject reset the counter. An API key keeps full
  authority (single approve), and a company with no active chain is unchanged.
  Resolves review-log item 6.

### Security
- **Per-link share-link revocation (#590).** Shareable invoice links are
  stateless JWTs, so an individual link couldn't be killed before its `exp`
  (≤90 days) without rotating `SHARE_SECRET` (which kills every link). Each
  minted link now carries a random `jti`; a new tenant-scoped
  `POST /v1/share/revoke` deny-lists a token's `jti` (in the new
  `RevokedShareLink` table) after verifying the caller owns the invoice, and
  the public view rejects a revoked link with a 401 (same message as an
  invalid token — no revocation-status leak). Idempotent. Resolves review-log
  item 4.
- **GDPR export streams instead of buffering (#589).** `GET
  /v1/gdpr/customer/:id/export` previously ran seven un-`limit`ed parallel
  `findAll`s and held the entire result set in memory — an OOM/DoS vector for
  a customer with a large history. It now streams the same JSON object,
  keyset-paginating each relation (`pk > lastId` batches of 500) so peak
  memory is bounded regardless of total rows. No truncation — GDPR
  completeness is preserved. Resolves review-log item 3.
- **Idempotency now prevents concurrent double-execution (#588).** The
  `Idempotency-Key` middleware previously wrote its cache row *after* the
  handler, so two simultaneous same-key requests both executed the side
  effect (a double-charge risk). It now performs a **pre-handler atomic
  claim** (`INSERT … ON CONFLICT DO UPDATE … WHERE ikExpiresAt < now()
  RETURNING`): exactly one request wins and runs the handler; a concurrent
  same-key+body request gets `409 idempotency_in_progress` while it's
  in-flight and replays the cached response once it completes. The claim is
  released on a 5xx / non-JSON exit so a genuine retry re-runs, and a
  crashed holder's claim is re-claimable after a 5-minute `PENDING_TTL`. A
  migration makes `ikResponseStatus`/`ikResponseBody` nullable for the
  pending state. Resolves review-log item 2.

### Fixed
- **`expAmount` and `phaseBudgetAmount` reject out-of-range values (400, not
  500).** The last two money fields lacking an upper bound — `expAmount`
  (overflows `money.toCents()` → `Infinity` → a 500 in the expense billing
  view / rollup) and `phaseBudgetAmount` (DB overflow) — now cap at
  `999,999,999.99`, completing `.max()` coverage across **every** money
  field. Found by the systematic FK audit (the remaining unchecked FK, a
  BillableRule match-id, is inert — never dereferenced, company-scoped
  evaluation — so left as-is).
- **Dunning no longer over-dunns.** Two bugs in the payment-reminder digest
  made it email customers wrong "overdue" amounts, both from diverging from
  the authoritative `invoice-status` engine: (1) a **write-off was ignored**,
  so a fully-forgiven invoice was dunned for its full balance — the digest
  now settles `total − collected − writeOff`; and (2) the default
  (`olderThanDays=0`) run flagged an invoice **due today** as overdue (a #556
  side effect) — it now requires the reference date to be **strictly** before
  today (`dueDate < today`, matching `deriveStatus`), while preserving #556's
  inclusive cutoff for `olderThanDays > 0`. Found by the remaining-services
  review.
- **Expense markup is bounded (400, not 500).** `expMarkupPct` (a fraction,
  `0.15` = +15%) had no upper bound, so a value ≥ 100 overflowed its
  `DECIMAL(6,4)` column → a **500** at write (and a fraction-vs-percent typo
  like `15` silently billed 1500%). It now caps at `99.9999` → a clean 400
  (`>100%` markup stays allowed). Found by the expenses/receipts review,
  which verified the markup math exact via `money.js`, the roll-up
  billable-only + un-invoiced + transaction-marked (no double-bill), receipt
  bytes stored in Postgres `bytea` (no disk → no path traversal), uploads
  triple-bounded (100kb → 10M-char → 5MB), and content-type enum-constrained
  and served inert (SVG/HTML rejected).
- **Rate / amount fields reject out-of-range values with a 400.** The rate
  and money fields (`btHourlyRate`, `jobFlatRate`, `jobBudgetAmount`,
  `taskRate`, `custDefaultRate`, `roleRate`, `rschRate`, `workerCostRate`)
  had no upper bound, so a value above the `NUMERIC(14,2)` column limit
  parsed fine and **overflowed to a 500** at write time. Each now caps at
  `999,999,999.99` → a clean 400. Found by the rate-resolution review, which
  verified the resolution arithmetic, precedence, `$0`-vs-unset handling,
  effective-dating boundaries, and tenant scoping **sound** (the deeper
  temporal findings — no rate snapshot, archive-fallthrough — are recorded
  as design decisions in `docs/SECURITY-REVIEW-LOG.md`).
- **Invoice PDF shows the discount line.** A discounted invoice's PDF
  rendered Subtotal / Tax / Total with **no Discount row**, so the printed
  document didn't add up — e.g. Subtotal 30.00 + Tax 2.06 shown against a
  Total of 27.06, an unexplained 5.00 gap — even though the billed Total and
  Balance Due were correct. The footer now emits a `Discount` deduction row
  when a discount is present, so `Subtotal − Discount + Tax = Total`
  reconciles on the page (the totals-row logic is extracted to a testable
  `totalsRows` helper). Found by the invoice financial-computation review,
  which otherwise verified the tax, balance, aging, and numbering math sound.
- **Invoice rollup excludes REJECTED time entries** (#440). The
  time-entry → invoice rollup filtered on billable / job-linked /
  not-yet-invoiced but **not** on approval status, so an entry a reviewer
  had explicitly *rejected* still rolled into an invoice — padded hours a
  manager killed would bill the client anyway. The rollup now excludes
  `teApprovalStatus = 'rejected'` (open / submitted / approved still bill —
  approval is not otherwise a billing gate; that broader policy is an open
  decision in `docs/SECURITY-REVIEW-LOG.md`). Found by an adversarial
  approval-workflow review; an integration test pins the filter against
  real Postgres.
- **Audit trail records the data subject of a GDPR erase/export** (#462).
  `entityIdOf` only captured a record id immediately after the entity
  segment, so `/v1/gdpr/customer/:id/erase` (id two segments deep) logged
  `alogEntityId = null` — the DCAA trail lost *which* customer a
  right-to-erasure / export request affected, i.e. the single most
  sensitive action recorded without its target. The matcher now also
  handles one nested sub-resource segment, while still excluding `by*` list
  qualifiers (a `bycompany/5` id stays `null`). Found by an adversarial
  data-handling review that otherwise confirmed the compliance path sound
  (export is tenant-scoped, the PII scrub is column-complete, and **no
  secret can reach the audit log** — it stores metadata only).
- **`buildLinkHeader` floors `limit` / `offset` / `count` to integers.** A
  fractional value would otherwise leak into the generated RFC-5988
  pagination links (e.g. `offset=94.5`). Latent today — controllers pass
  integer-parsed values — but the helper is now robust to a float; `NaN` /
  negative inputs still return `null`. Found by an adversarial review of
  the request-integrity middleware.
- **`report-timesheet.weekKey` no longer throws on a calendar-invalid
  date** (#68). `isoDatePart` validates format only, so a value like
  `2026-13-45` parsed to Invalid Date and `weekKey`'s `toISOString()` threw
  `RangeError` — while `dayKey` tolerated the same input. `weekKey` now
  returns its `unknown` sentinel instead, giving parity and keeping the
  week-report path crash-safe. Found by an adversarial date/time review.
- **Dunning digest includes an invoice due exactly `olderThanDays` ago**
  (#10). The overdue cutoff used a strict `>= cutoff` skip, excluding an
  invoice on the exact boundary even though the module contract flags
  anything "at least `olderThanDays` days in the past". The boundary day is
  now included (`> cutoff` skip); a regression test pins it. Found by the
  same review.
- **Payroll labor cost is computed from exact minutes, not pre-rounded
  hours** (#456). `payroll.js` multiplied each worker's *display* hours
  (already snapped to 2 decimals) by the cost rate, injecting up to
  `0.005 × rate` of error per worker — e.g. 50 min @ $100/hr produced
  `$83.00` instead of the correct `$83.33` — and accumulating it in the
  grand `costTotal`. Cost now derives from `rate × minutes/60`, rounded
  once, matching the billing-side calc in `rate.js`. Surfaced by an
  adversarial correctness review of the money path; a regression test with
  non-exact-hour minutes now pins it.
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
- **All money columns are now `NUMERIC(14,2)`.** `btHourlyRate`, `cpayAmount`,
  and `injbAmount` — the last three money columns stored as `DOUBLE` — are
  converted to `NUMERIC(14,2)` with a Number getter, matching every other
  money column (exact-decimal at rest). Behaviour-preserving: `money.js`
  already rounds to cents and the schemas bound the magnitude, so the cast
  only pins existing values to 2 dp. Closes the storage-consistency note in
  `docs/SECURITY-REVIEW-LOG.md` (items 3 / 11).
- **Consolidate CSV export assembly into a shared `buildCsv` helper.** The
  customer and time-entry `export.csv` builders duplicated the same inline
  header + escaped-rows loop; both now call `buildCsv(fields, records,
  note)` in `_csv-escape.js` (byte-identical output). The assembly is now
  unit-testable, and a new regression test asserts a hostile user field is
  formula-escaped in the export **body** — closing a gap flagged by the
  CSV-export review, which otherwise found every cell already escaped,
  headers safe, and the download filename validated.
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

### Documentation
- **Adversarial security & correctness review log**
  (`docs/SECURITY-REVIEW-LOG.md`). A subsystem-by-subsystem record of the
  review — the findings fixed (a pre-auth idempotency DoS, a period-lock
  timezone bypass, a payroll rounding error, an email header-injection
  guard, and more), the controls verified sound (crypto/auth primitives,
  multi-tenant scoping, the compliance data path, share links), and the
  open items that need a **design decision** (RBAC enforcement, idempotency
  concurrency, streamed GDPR export, per-link share revocation). Linked
  from `docs/SECURITY-POSTURE.md`.
- **Architecture & conventions guide** (`docs/ARCHITECTURE.md`). A
  maintainer-facing map of the system design — the request lifecycle, the
  multi-tenant auth model and `getCompanyId*` resolver family, the
  increment-layer schema convention, the controller/service split, and the
  three-tier testing strategy (including the guard-rail meta-tests). Linked
  from `README.md` (new "Design & internals" section) and `CONTRIBUTING.md`.
- **Align the OpenAPI `TimeEntry` component with the model + schema** (#372).
  The published component omitted `teWorkerId` / `teJobId` / `teBillTypeId`
  / `teTaskId` (and `teTags`, plus the read-only `teApprovalStatus` /
  `teInvJobId`) even though the create/update schema accepts them and the
  model stores them — so the spec (and the generated Postman collection)
  understated the API. The component now lists all of them. (Regenerate
  `setup/TimeTrackerAPI.postman_collection.json` from the spec to propagate.)
- **Cross-tenant response-code policy** (#375). The README's "Secure-404 on
  cross-tenant access" section now spells out, in a table, exactly when the
  API returns **404** (a specific row you don't own — anti-enumeration)
  versus **403** (a rejected credential or a `bycompany` scope you named
  explicitly) versus **400** (validation / a bad cross-tenant foreign key),
  so the distinction reads as deliberate rather than incidental.

### Changed
- **Reuse attachAuth's context to avoid duplicate auth lookups** (#374).
  New `auth.masterFromReq(req, authKey)` / `companyIdFromReq(req, authKey)`
  return the `req.isMaster` / `req.companyId` that `attachAuth` already
  resolved on every `/v1` request, instead of each controller issuing a
  second identical DB lookup — a **pure optimization** (identical result,
  minus the round-trip; falls back to a live lookup when the context is
  absent, e.g. direct calls in unit tests). Rolled out across **every
  controller** (~38, hundreds of call sites) in reviewable batches — each
  behavior-preserving and validated by the full auth-scoping suite. The
  per-entity resolvers (`getCompanyIdBy{CustomerId,JobId,PovId,PohId}`)
  stay live, since attachAuth doesn't cache them.
- **Consolidate the customer→company lookup** (#378). `customercontroller`
  dropped its hand-rolled raw-SQL `GetCustomerCompanyId` and now aliases
  the shared `auth.getCompanyIdByCustomerId` (same semantics — empty/zero
  → -1, archived excluded, but fetches only `custCompId` instead of
  `SELECT *`). Tenant resolution lives in one place; the now-unused
  `sequelize` import is gone. Behavior-preserving (covered by the existing
  customer tests).

### Fixed
- **Surface a database outage as 503, not 403** (#377). When Postgres is
  unreachable, the auth lookups previously swallowed the connection error
  into the same "unknown key" sentinel, so the API answered **403** —
  indistinguishable from a bad credential and misleading during an outage.
  `isMaster`/`getCompanyId` now re-throw genuine connection errors (a new
  `isDbUnavailable` classifier; logical misses still collapse to the
  sentinel), and `attachAuth` maps them to **503 Service Unavailable**.

### Security
- **Separation of duties on approval — no self-approval (#440/#448).** Adds a
  nullable `workerUserId` link (Worker → User; tenant-checked on
  create/update/bulk like every other FK) so the approval action can reject a
  signed-in user approving their **own** logged time (the entry's worker
  resolves to the acting user) with a 403. Completes the approver-authorization
  item — the role check (`time:approve`, manager+) plus separation of duties.
  API-key path unchanged.
- **RBAC on the approval action (#440/#448).** The timesheet-approval endpoint
  now enforces a new `time:approve` permission (granted to **manager and up**)
  for a signed-in (JWT) actor, scoped to the actor's own company (secure-404);
  a `member`/`viewer` gets a 403. The API-key path is unchanged (full
  authority). Separation-of-duties (blocking self-approval) remains open — it
  needs a `User`↔`Worker` link the model doesn't have yet (documented in
  `docs/SECURITY-REVIEW-LOG.md` item 8).
- **RBAC on the full user-management surface (#448).** Extends the initial
  role-write enforcement to the remaining user endpoints for a signed-in
  (JWT) actor: `GET /v1/user/:id` + `bycompany` require `user:read` and are
  scoped to the actor's own company (secure-404 / 403); `PATCH /v1/user/:id`
  allows a user to edit **its own** profile but requires `user:write` to edit
  another; `DELETE /v1/user/:id` requires `user:write`. The API-key path is
  unchanged (full authority).
- **RBAC enforcement for signed-in users (#448).** `rbac.canAssignRole` was
  defined but had no call sites. A new `attachUser` middleware resolves the
  Bearer-JWT sign-in path into `req.user = { userId, userCompId, userRole }`
  (the actor, parallel to the API-key context), and the role-write endpoints
  — `POST /v1/user`, `PATCH /v1/user/:id/role`, `POST /v1/invitation` — now
  enforce RBAC when a signed-in user is acting: no privilege escalation
  (`canAssignRole` — requires `user:manage-roles`), can't change a user who
  **out-ranks** you (`canChangeRole`), and scoped to your own company
  (secure-404). The **API-key path is unchanged** — a company/master key
  remains the tenant's full-authority credential, so a signed-in *user* is
  the constrained actor.
- **CustomerPayment bulk allocates only to same-customer invoices.** The
  single-create path checks that `cpayInvId` references an invoice for the
  **same customer** (`checkInvoiceAllocation`), but the **bulk** path skipped
  it — so a batch could book a payment against **another customer's / tenant's
  invoice**, corrupting that invoice's computed balance and AR aging. The bulk
  helper gained a `perEntryCheck` hook and CustomerPayment bulk now runs the
  same same-customer allocation check per entry (a company-level FK check
  would be too weak — the rule is *same customer*, not just same company).
  Found by the systematic FK audit.
- **Tenant-check the Worker rate-source FKs (`workerDefaultBillType`,
  `workerRoleId`).** Both were **unchecked** on create / update / bulk, so a
  company-scoped caller could point a worker at **another tenant's
  BillingType or Role** — and because `rate.js` resolves a worker's rate from
  `worker.defaultBillingType.btHourlyRate` / `worker.role.roleRate`, that
  pulls a **foreign rate card into billing** (proven: resolved to company
  B's `roleRate`). New `auth.getCompanyIdByBtId` / `getCompanyIdByRoleId` +
  `billingTypeFkBelongsTo` / `roleFkBelongsTo` reject a cross-tenant or
  missing FK with a 400 on create, update, **and** bulk (the bulk
  `secondaryFk` helper now accepts multiple FKs). Same secondary-FK class as
  the inventory / invoice-line fixes; found by a **systematic FK audit of
  every controller**.
- **Tenant-check the invoice FK on invoice lines (cross-tenant injection).**
  `InvoiceJob` create/bulk tenant-checked only the parent `injbJobId` (the
  job's company), leaving `injbInvId` — the **invoice** the line attaches to
  — unchecked. So a company-scoped caller could attach a line, with an
  arbitrary `injbAmount`, to **another tenant's invoice**: it renders on the
  victim's customer-facing invoice PDF (leaking the attacker's `jobDesc` +
  amount) and makes sum-of-lines diverge from the stored total — and because
  line management scopes via the job, the victim gets a 404 on the injected
  line and **can't remove it**. New `auth.getCompanyIdByInvId` +
  `invoiceFkBelongsTo` reject a cross-tenant or missing `injbInvId` with a
  generic 400 on create **and** bulk (the same secondary-FK class as the
  inventory fix). Found by the payment-allocation / invoice-line review.
- **Bound `cpayAmount` / `injbAmount` to stop an AR-report DoS.** Both money
  fields were `.finite()` but **unbounded**, so a finite-but-huge value
  (e.g. `1e308`) overflowed `money.toCents()` to `Infinity` and threw
  uncaught in the invoice / AR-aging / PDF consumers — one poisoned payment
  500'd the **whole company's aging report** (`summarize` is mapped over
  every invoice). Both now bound the magnitude (negatives still allowed for
  reversals / credit lines).
- **Block SSRF in outbound webhook delivery.** A tenant registers its own
  `whkUrl` and the server POSTs to it, previously with only a **structural**
  URL check — so a webhook (or its `POST /v1/webhook/:id/ping`) pointed at
  `http://169.254.169.254/` (cloud metadata), `http://127.0.0.1:6379/`, or
  any private / link-local host was delivered, `fetch` **followed
  redirects** (a public→internal 302 bypassed a naive registration check),
  and the `ping` response status leaked back as an internal-reachability
  oracle. New `app/services/ssrf-guard.js` (`safeFetch`) pins the scheme to
  http(s), resolves the destination and **rejects any loopback / link-local
  / private / reserved / IPv4-mapped-to-those IP**, and **re-validates every
  redirect hop**; the webhook schema also pins the scheme at registration.
  Found by the outbound-HTTP SSRF review, which verified the HMAC signing,
  write-only secret handling, timeout, and no-response-body-read as sound
  (and confirmed the notifier is not a tenant-controlled URL surface).
- **Tenant-check the inventory-item FK on PO lines, inventory transactions,
  and product entries.** Each of these entities validated its *parent* FK's
  company (PO header / company / job) but left the secondary inventory FK
  (`polInvtId` / `invtInitId` / `pentInvtId` → `InventoryItem`) **unchecked**,
  so a company-scoped caller could attach a line / transaction / product to
  **another tenant's** inventory item (or a dangling id — two of the three
  have no DB FK constraint). New `auth.getCompanyIdByInvitId` +
  `inventoryFkBelongsTo` reject a cross-tenant or missing inventory FK with a
  generic `400` (one message for both, so the endpoint can't probe another
  tenant's item ids) on create, update, **and** the bulk paths. Found by the
  previously-unreviewed inventory / purchase-order subsystem review.
- **Bound report-PDF rendering — the same event-loop-stall DoS.**
  `report-pdf.js` `drawTable` rendered every row's cells with no cap and no
  clip, and the customer name (`custName`) is caller-controlled — 100 rows
  × a 10 000-char name froze the single-threaded event loop ~9 s per
  revenue-report PDF (worse than the invoice case). Cells are now clipped
  (`MAX_CELL_CHARS`) and the row count capped (`MAX_TABLE_ROWS`, remainder
  summarised), bounding render time to well under a second (9 s → 0.11 s).
  Sibling fix to the invoice-PDF bound below; found by extending the same
  review to the report renderer.
- **Bound invoice-PDF rendering — stop a synchronous event-loop-stall
  DoS.** `drawInvoice` rendered every line item synchronously with no cap,
  and a long unbroken `jobDesc` (up to 10 000 chars) triggers pdfkit's
  **superlinear** word-fit measurement — 100 such lines froze the
  single-threaded event loop for ~6 s per `GET /v1/invoice/:id/pdf`,
  stalling the **whole server** (including `/healthz`) from one
  authenticated request; the rate limiter doesn't help because one request
  blocks. Each rendered description / notes field is now clipped
  (`MAX_DESC_CHARS` / `MAX_NOTES_CHARS`) and the line count capped
  (`MAX_PDF_LINES`, the remainder summarised), bounding render time to well
  under a second (measured 5.85 s → 0.13 s). Found by an adversarial
  invoice-PDF review.
- **Mailer rejects CR/LF in `subject` / `from` (email header-injection
  guard)** (#68). `sendMail`'s validator checked the `to` address shape but
  not `subject` or `from` for line breaks, so a user-controlled value — a
  scheduled-report subject built from a company name, or a caller-supplied
  `from` — could smuggle an extra SMTP header (`Bcc:`, …) or split the body
  the moment a real SMTP transport is wired behind `setTransport`. All
  header fields are now CRLF-rejected at the shared choke point. Latent
  today (only the no-network capture transport is wired) — defense in depth
  for the SMTP-adapter follow-up. Found by an adversarial data-egress
  review that otherwise confirmed the path sound: recipient injection is
  blocked, and share links are non-forgeable (signed, single-resource,
  expiry-enforced) with no cross-tenant read and no SSRF.
- **`rbac.permissionsFor` fails closed on prototype-named roles** (#448). A
  role string matching an `Object.prototype` key (`__proto__`,
  `constructor`, `toString`) resolved `PERMISSIONS[role]` to an inherited
  non-array and threw `TypeError` on `.slice()`, rather than returning `[]`
  as it does for any other unknown role. Guarded with `hasOwnProperty` so a
  non-own key reads as unknown → no permissions (and no throw), propagating
  through `hasPermission` / `canAssignRole`. Not currently exploitable
  (role writes pass through `isRole` / `z.enum(ROLES)`), but removes a
  landmine for when `canAssignRole` is wired to user-supplied input. Found
  by an adversarial RBAC review.
- **Bound `canonicalJson` recursion — close a pre-auth DoS in the
  idempotency middleware.** The middleware hashed the request body via an
  **unbounded** recursive `canonicalJson`, so a deeply-nested JSON body
  (well within the 100 KB `express.json` limit) overflowed the V8 call
  stack. Because the middleware is mounted async **without** a `.catch` and
  the process has no `unhandledRejection` net, that `RangeError` could
  **crash the process** — reachable **pre-auth** on any `POST /v1/*` that
  carries an `Idempotency-Key`. `canonicalJson` is now depth-bounded
  (`MAX_CANONICAL_DEPTH = 64`, throwing a tagged `CanonicalJsonDepthError`
  that the middleware returns as a clean `400 { code: 'body_too_deep' }`),
  and the router mount now routes any async rejection to the error handler
  (→ 500) rather than to the process. This brings the previously-unmerged
  fix (`580109b`) onto `main` and hardens the mount. Found by an
  adversarial review of the idempotency middleware.
- **JWT `verify` requires the `exp` claim (fail-closed)** (#445). `verify`
  checked expiry only when `exp` was present, so a token minted without one
  (or with a non-numeric `exp`) never expired — despite the module
  documenting that verify "enforces the exp claim". It now rejects any
  token lacking a finite numeric `exp`. No app token is affected (`sign`
  always sets `exp`); this only fails closed against a hand-crafted or
  future exp-less token. Defense-in-depth from an adversarial crypto/auth
  review that otherwise found the JWT/scrypt/token-hashing primitives sound
  (alg-none rejected, algorithm-confusion immune, constant-time compares,
  CSPRNG tokens hashed at rest).
- **Close a closed-period lock bypass via a timezone offset** (#441).
  `time-lock.js` derived an entry's calendar day from the literal
  `YYYY-MM-DD` prefix of a `teStartedAt` **string** (wall-clock) but from
  `toISOString()` (UTC) for a `Date`. An offset-bearing timestamp such as
  `2026-07-07T01:00:00+05:00` — the instant `2026-07-06T20:00:00Z`, which
  belongs to a *locked* day — was bucketed to `2026-07-07` and slipped
  past the lock, so create/edit/delete was wrongly allowed in a closed
  period (and, in reverse, a genuinely-editable entry could be wrongly
  frozen). `dateOf` now normalizes a date-time string to the true UTC day
  the instant falls on (a bare `YYYY-MM-DD` is still taken as-is), matching
  the `Date` path; malformed dates resolve to `null` instead of a wrong
  slice. Found by an adversarial date/time review; regression tests pin
  both offset directions.
- **Tenant-scope `teCustId` on time-entry create** (#373). Creating a time
  entry (single or bulk) now verifies the customer belongs to the
  effective company — a scoped key can no longer book time against another
  tenant's customer (previously only a supplied `teJobId`'s customer was
  cross-checked; a jobless entry with a foreign `teCustId` slipped through).
  Returns 400 when the customer is missing or in another company.

### Added
- **Bulk time-entry import** (#379). `POST /v1/timeentry/bulk`
  `{ entries: [...] }` creates up to 200 entries in one call. Each row is
  validated and created **independently** — a bad row fails on its own and
  the rest still import — with a per-row `results[]` (`ok`/`teId` or
  `status`/`message`) and counts. Status is **201** all-ok, **207**
  partial, **400** all-failed. Single-create and bulk now share a
  `createOneEntry` helper, so both apply identical validation, worker/job
  link checks, and the locked-period guard.
- **Billable-classification rules** (#415). A new company-scoped
  `BillableRule` entity, migration `20260630000000`, mapping a match on a
  time entry's **job / task / category** to a default billable /
  non-billable classification. Rules evaluate **first-match by priority**
  (like the rate resolver); non-null criteria are required, null criteria
  are wildcards (an all-null rule is a catch-all). Full REST on
  `/v1/billablerule` (create, `bycompany` list, get/patch/delete) plus
  `POST /v1/billablerule/evaluate` → `{ billable, matchedRuleId }`. Pure
  `billable-rules.js` engine.
- **Custom fields** (#409). A new company-scoped `CustomFieldDef` entity,
  migration `20260629000000`, declaring **typed** custom fields
  (text/number/date/boolean) for a target entity (`customer` / `job` /
  `timeentry`). Full REST on `/v1/customfield` (create — name-unique per
  entity, `bycompany` list with `?entity`, get/patch/delete) plus
  `POST /v1/customfield/validate` which coerces + checks a values object
  against the company's defs (**422** with per-field errors on failure).
  Pure `custom-field.js` (`coerceValue`, `validateAgainstDefs`); attaching
  values to records is a follow-up.
- **SOC 2 & security-posture roadmap** (#463). New
  [`docs/SECURITY-POSTURE.md`](docs/SECURITY-POSTURE.md) inventories the
  implemented technical controls (auth tiers, secure-404 tenant isolation,
  RBAC, GDPR export/erase, the DCAA audit trail, formula-injection-safe
  CSV, rate limiting, idempotency, dependency-free crypto), maps them to
  the SOC 2 Trust Services Criteria, and lays out a prioritized readiness
  roadmap. Cross-linked from the README and `SECURITY.md`. Docs only.
- **DCAA-grade audit trail** (#462). Extends the audit log (#460) with the
  detail a defense-contract-grade trail needs (migration
  `20260628000000`): `alogEntityId` (the touched record — now stamped
  automatically by the audit middleware from the request path),
  `alogChanges` (before/after field diff, JSONB), and `alogReason`
  (justification). `GET /v1/auditlog/bycompany/{id}` gains **entityId /
  actor / from / to** filters for a queryable trail. Pure `audit-trail.js`
  (`entityIdOf`, `diffFields`, `hasChanges`) supplies the reusable
  change-diff capability.
- **Slack / Teams notifications** (#454). `POST /v1/notification/dispatch`
  `{ channel, text }` sends a notification to Slack or Teams via a pure
  `notifier.js` that mirrors the mailer's transport abstraction — the
  default is a no-network **capture** transport (dev/CI/unconfigured-prod
  safe); a real incoming-webhook transport (`SLACK_WEBHOOK_URL` /
  `TEAMS_WEBHOOK_URL`) drops in behind the same `send()` interface. Gives
  the reminder features a delivery channel beyond email (#68). Requires a
  valid API key; no new tables.
- **Capacity & resource planning** (#459). `GET /v1/capacity/summary`
  reports, per worker over a `from`/`to` period, **target hours** (each
  worker's `workerTargetMinsPerWeek` × weeks in the period) vs. **logged
  hours**, with **utilization %** and **remaining capacity** — plus
  company totals. Every worker is listed (a zero-logged worker shows full
  remaining capacity). Pure `capacity.js` aggregator; company-scoped; no
  new tables.
- **Teammate invitations** (#458). A new company-scoped `Invitation`
  entity, migration `20260627000000`. `POST /v1/invitation` invites an
  email to join a workspace with a chosen RBAC role — storing only the
  token's SHA-256 and emailing the token via the mailer (#68).
  `POST /v1/invitation/accept` is **public**: it validates the token
  (pure `invitation.js`), provisions a `User` (#444) with the invited role
  and the caller's password, and consumes the invite.
  `GET /v1/invitation/bycompany/{id}` lists invitations (token hash
  withheld); `DELETE` revokes. Duplicate-email guarded (409).
- **Multi-level approval chains** (#443). A new company-scoped
  `ApprovalChain` entity (ordered approver levels, each requiring an RBAC
  role), migration `20260626000000`. Full REST on `/v1/approvalchain`
  (create / `bycompany` list / get / patch / delete) plus
  `GET /{id}/next?approvals=n` which resolves the next required level +
  role (and, with `actorRole`, whether that actor may approve — more
  privileged roles may approve for less). Pure `approval-chain.js`
  (validate/renumber levels, next-step, can-approve) building on the RBAC
  model (#448) and extending the single-step approval machine (#440).
- **Shareable client-facing invoice links** (#438). `POST /v1/share/invoice/{id}`
  mints a **signed, expiring** link (HS256 JWT via `jwt.js`, keyed by the
  `SHARE_SECRET` env var; default 7-day, max 90-day lifetime) for one of
  the tenant's invoices. `GET /v1/share/invoice?token=…` is **public — no
  API key** — and returns a read-only, client-safe projection (totals,
  collected, balance, customer name; internal fields withheld) authorized
  by the signed token alone. Both 503 when `SHARE_SECRET` is unset. Pure
  `share-link.js` (TTL policy + projection); no new tables.
- **Payroll export** (#456). `GET /v1/payroll/export` produces a
  payroll-ready **CSV** of completed worker hours over a pay period
  (`from`/`to`) — per worker: total / billable / non-billable hours and a
  labor-cost total (hours × `workerCostRate`, exact money) — reusing the
  OWASP formula-injection-safe cell escaper. `GET /v1/payroll/summary`
  returns the same aggregation as JSON. Pure `payroll.js` aggregator;
  company-scoped; no new tables.
- **GDPR data export & erasure** (#461). `GET /v1/gdpr/customer/{id}/export`
  returns a portable JSON bundle of everything held about a customer
  (record + invoices, jobs, expenses, time entries, payments, retainers,
  recurring invoices, with counts) for data-portability requests.
  `POST /v1/gdpr/customer/{id}/erase` performs right-to-erasure —
  scrubbing the customer's PII (pure `gdpr.js` redaction map; NOT-NULL
  columns get a placeholder, nullable ones null out) while **retaining
  financial records** for accounting/tax, then archives the row. Both
  company-scoped with secure-404; no new tables.
- **Roles & permissions (RBAC)** (#448). Each user (#444) now carries a
  `userRole` (owner/admin/manager/member/viewer; migration
  `20260625000000`, defaults to `member`). A pure `rbac.js` defines the
  cumulative permission matrix + `canAssignRole` (no privilege
  escalation). `PATCH /v1/user/{id}/role` sets a role;
  `GET /v1/user/{id}/permissions` returns a user's effective permissions;
  `GET /v1/me` now includes the caller's role + permissions. The model is
  surfaced for client/JWT enforcement; the API-key auth path is unchanged.
- **Scheduled report delivery** (#57). A new company-scoped
  `ReportSchedule` entity (report, recipient, cadence, next-run),
  migration `20260624000000`. Full REST on `/v1/reportschedule` (create,
  `bycompany` list, get/patch/delete) plus `GET /due` (schedules due ≤
  today) and `POST /{id}/run` which **renders the report** (revenue
  summary via `report-revenue.js`), **emails it** through the mailer
  (#68), then advances `rptschNextRun` by the cadence (via the #425
  engine). Pure `report-email.js` formatter. First v2.0 item — ties
  together the reporting, mail, and cadence subsystems.
- **Receipt attachment / upload** (#419). A new `Receipt` entity attached
  to an expense (#416), migration `20260623000000`. Upload a file as
  base64 JSON (`POST /v1/receipt`) — the bytes are stored in Postgres
  (`bytea`), capped at 5 MB decoded, content-type whitelisted; the
  effective upload size is governed by the `JSON_BODY_LIMIT` env var
  (default 100kb). `GET /v1/receipt/{id}/download` streams the file;
  `GET /v1/receipt/{id}` + `GET /v1/receipt/byexpense/{id}` return metadata
  only (never the bytes); `DELETE` soft-deletes. Expense→company scoped
  with secure-404. Self-contained (no object-store dependency); an S3
  backend can drop in behind the controller later.
- **Password reset** (#446). `POST /v1/password-reset/request` mints a
  one-time token, stores only its SHA-256 + a 1-hour expiry on the user
  (migration `20260622000000`), and emails the token via the mailer (#68);
  it **always returns 200** whether or not the account exists
  (anti-enumeration). `POST /v1/password-reset/confirm` verifies the token
  hash + expiry and sets the new (scrypt-hashed) password, consuming the
  token. Pure `password-reset.js` (token gen + validity); completes the
  auth trio (#444/#445/#446).
- **User login (JWT)** (#445). `POST /v1/login` verifies a user's email +
  password within a company and issues a short-lived (12h) **HS256 JWT**;
  `GET /v1/me` returns the signed-in user for a `Bearer` token. Tokens are
  signed with Node's built-in crypto HMAC (**no dependency**; constant-time
  verify, `exp` enforced — pure `jwt.js`), keyed by the `JWT_SECRET` env
  var (sign-in returns **503** when unset). Invalid credentials return a
  **generic 401** (no email enumeration). This is a second, optional auth
  path — the existing API-key auth is unchanged. No migration.
- **User accounts** (#444). A new company-scoped `User` entity (email,
  name, scrypt-hashed password), migration `20260621000000`, with full
  admin-provisioned REST on `/v1/user` (create, `bycompany` list,
  get/patch/delete) and secure-404 scoping. Passwords are hashed with
  Node's built-in **scrypt** (no dependency; per-hash salt, constant-time
  verify — pure `password.js`) and the **hash is write-only** — no endpoint
  returns it; email is unique per company. This is the foundation for
  login (#445) and password reset (#446); the existing API-key auth is
  unchanged. No live sign-in yet.
- **Rate effective-dating** (#414). A new company-scoped `RateSchedule`
  entity (`rschRate` over `rschEffectiveFrom`..`rschEffectiveTo`, the
  latter open-ended when null), migration `20260620000000`. Full REST on
  `/v1/rateschedule` (create, `bycompany` list, get/patch/delete) plus
  `GET /v1/rateschedule/resolve?date=` which returns the rate in effect on
  that date via a pure `rate-schedule.js` resolver (latest applicable
  `effectiveFrom` wins). Lands the model + a queryable resolver; wiring
  date-aware selection into `rate.js`'s live billing resolution is a
  follow-up (keeps the well-tested resolver untouched).
- **Milestone billing** (#428). `POST /v1/invoice/from-phase` generates
  an invoice for a project phase's fixed budget (`phaseBudgetAmount`) as a
  single line on the phase's job — reusing the roll-up's numbering, tax,
  currency, and discount handling, but billing a fixed fee rather than
  time. A new `Phase.phaseBilledInvId` (migration `20260619000000`) records
  the invoice and **409s a double-bill**. Phase→company scoped
  (secure-404). Arbitrary jobless fixed-fee lines are a follow-up (invoice
  lines currently require a job).
- **Payment reminders / dunning** (#10). `POST
  /v1/invoice/payment-reminders` finds invoices that are overdue (past
  their due date, or invoice date when none, shifted by `olderThanDays`)
  **and** carry a balance outstanding (`total − collected`, exact-cent),
  and emails a dunning digest to `to` — the AR companion to the approval
  reminders (#442), on the same mail service (#68). Pure
  `payment-reminders.js` builds the digest; company-scoped (master keys
  pass `companyId`). No migration.
- **Approval reminders** (#442). `POST /v1/timeentry/approval-reminders`
  finds time entries stuck in `submitted` past a threshold
  (`olderThanDays`, default 7) and emails an approver (`to`) a digest —
  wiring the approval workflow (#440) to the mail service (#68). Pure
  `approval-reminders.js` builds the subject/body; delivery goes through
  `mailer.sendMail` (captured, not sent, until a real SMTP transport is
  configured). Company-scoped (master keys pass `companyId`). No migration.
- **Email / notification service** (#68). A transport-abstracted mailer
  (`mailer.js`) — the foundation approval/payment reminders and scheduled
  report delivery build on: features call `sendMail({to, subject, text})`
  and stay decoupled from the transport. The default is a **no-network
  capture transport** (validates + records; dev/CI/unconfigured-prod
  safe), with `setTransport()` to drop in a real SMTP adapter behind the
  same interface (a config follow-up that adds no coupling and no
  dependency here). Master-only `POST /v1/notification/test` verifies
  delivery and reports the active transport. No migration.
- **Outbound webhooks** (#69). A new company-scoped `Webhook` registry
  (URL, event, optional signing secret, active flag), migration
  `20260618000000`. Full REST on `/v1/webhook` (create, `bycompany` list,
  get/patch/delete) plus `POST /{id}/ping` which delivers a test event and
  reports the outcome. Deliveries are signed HMAC-SHA256
  (`X-Webhook-Signature`) via a pure `webhook-signer.js`, sent best-effort
  through a timeout-bounded `webhook-delivery.js` (global `fetch`). The
  **secret is write-only** — no endpoint returns it. Auto-firing on
  domain events (invoice.created, payment.recorded, timeentry.approved) is
  a bounded follow-up.
- **Report export beyond CSV — revenue PDF** (#433). `GET
  /v1/report/revenue.pdf` streams the revenue summary as a branded,
  printable PDF (company header, totals, by-customer and by-month tables)
  — same data + company scoping as the JSON `GET /v1/report/revenue`.
  Reuses the invoice-PDF's lazy-`pdfkit` pattern (no new dependency) via a
  pure `report-pdf.js` renderer; amounts format through `money.js`.
- **API-key rotation & lifecycle** (#65). Master-only endpoints to manage
  company credentials: `POST /v1/apikey` (provision), `POST
  /v1/apikey/{id}/rotate` (replace the secret in place — the old key stops
  working immediately), `DELETE /v1/apikey/{id}` (revoke), and
  `GET /v1/apikey/{id}` + `GET /v1/apikey/bycompany/{id}` (metadata). The
  raw key is generated server-side (256-bit) and returned **exactly once**
  on create/rotate; only its SHA-256 hash is stored, and **no endpoint
  ever returns the hash**. No migration — builds on the existing ApiKey
  table + `auth.hashKey`.
- **Recurring invoice schedules** (#425). A new customer-scoped
  `RecurringInvoice` entity (cadence, next-run date, active flag),
  migration `20260617000000`. Full REST on `/v1/recurringinvoice` (create,
  `bycustomer` list, get/patch/delete) plus `GET /due` (active schedules
  whose next run is ≤ today, company-scoped) and `POST /{id}/run` which
  stamps `recinvLastRun` and advances `recinvNextRun` by the cadence via a
  pure, unit-tested date helper (weekly/monthly/quarterly/yearly, with
  end-of-month clamping). Secure-404 scoped; soft-delete via `recinvArch`.
  Generating the invoice document itself reuses the roll-up (follow-up).
- **Role-based rates** (#412). A new company-scoped `Role` entity
  (`roleName` + `roleRate`) and a `Worker.workerRoleId` link (migration
  `20260616000000`). The role rate slots into `rate.js` between the client
  rate and the worker default: entry → task → project → client → **role**
  → worker. Full REST on `/v1/role` (create, `bycompany` list,
  get/patch/delete) with secure-404; `workerRoleId` settable on worker
  create/update. It rides the already-eager-loaded worker association, so
  every billing path resolves it.
- **Project phases / billing stages** (#408). A new `Phase` model under a
  Job (`phaseName`, `phaseStartDate`, `phaseEndDate`, `phaseBudgetAmount`),
  migration `20260615000000` — a date-bounded, budgeted stage, the unit of
  milestone billing (distinct from a task/activity). Full REST:
  `POST /v1/phase`, `GET /v1/phase/byjob/{id}` (paginated, ordered by start
  date), `GET|PATCH|DELETE /v1/phase/{id}`, all job→company scoped with
  secure-404 + soft-delete (`phaseArch`); end-date validated on or after
  the start.
- **Worker utilization report** (#53). `GET /v1/report/utilization`:
  per worker, **billable hours vs capacity** (`workerTargetMinsPerWeek` ×
  weeks in the range) → utilization %, plus the billable ratio
  (billable / total logged), with team-wide totals. Company-scoped,
  `from`/`to` required, optional `workerId`. Pure
  `report-utilization.js` service.
- **Project profitability & margin** (#436). A new `Worker.workerCostRate`
  (internal cost/hour, migration `20260614000000`) plus
  `GET /v1/report/profitability`: per job, **revenue** (billable time
  priced through `rate.js`) net of **cost** (all logged time × the
  worker's cost rate) → **margin** and **margin %**, with company totals.
  The response flags entries with no resolvable rate or no cost basis so
  the numbers stay honest. Pure `report-profitability.js` service.
- **Per-task rate** (#411). `Task.taskRate` + a `TimeEntry.teTaskId`
  link (migration `20260613000000`) make the task the **most-specific**
  tier of rate resolution in `rate.js`: per-entry override → **task** →
  project → client → worker. It flows through the time-entry billing
  view, the invoice roll-up, and the unbilled/billable-summary/budget
  reports (all now eager-load `entry.task`). `teTaskId` is validated to a
  task in the company (and, if a job is named, under that job); `taskRate`
  settable on task create/PATCH.
- **Retainer management** (#426). A new customer-scoped `Retainer`
  entity (`retAmount` deposit + `retBalance` remaining), migration
  `20260612000000`. Full REST: `POST /v1/retainer`,
  `GET /v1/retainer/bycustomer/{id}`, `GET|PATCH|DELETE /v1/retainer/{id}`,
  plus `POST /v1/retainer/{id}/drawdown` which reduces the balance
  exact-cent and **409s on overdraw**. Secure-404 scoped through the
  customer's company; soft-delete via `retArch`.
- **Copy-previous time entry** (#399). `POST /v1/timeentry/{id}/copy`
  clones an entry's "what" — customer, worker, job, billing type,
  description, billable flag, tags — into a **fresh** entry (always
  `open` / un-invoiced). The optional body sets `teStartedAt` /
  `teEndedAt` (default: start now, in-flight). Secure-404 scoped; **409**
  if the copy would land in a locked period (#441). No migration.
- **Tasks / activities under jobs** (#407). A new `Task` model
  (`taskName`, `taskDesc`) under a Job, migration `20260611000000`. Full
  REST: `POST /v1/task`, `GET /v1/task/byjob/{id}` (paginated),
  `GET|PATCH|DELETE /v1/task/{id}`, all scoped through the job's company
  (`getCompanyIdByJobId`) with the same secure-404 + soft-delete
  (`taskArch`) as the other entities. Foundation for per-task rates and
  task-level reporting.
- **Client-specific rate cards** (#413). `Customer.custDefaultRate`
  (migration `20260610000000`, settable on customer create/PATCH) is the
  **client tier** of rate resolution in `rate.js`: per-entry override →
  project flat rate → **client rate** → worker default. It flows through
  the time-entry billing view, the invoice roll-up, and the reporting
  (unbilled, billable-summary, budget) — all now eager-load the customer
  rate.
- **Locked periods** (#441). Two freezes on time entries: an
  **approved** entry (from #440) can no longer be edited or deleted, and
  a per-company `compTimeLockDate` (migration `20260609000000`, settable
  on company create/PATCH) closes every entry dated **on or before** it.
  `POST` (create), `PATCH`, and `DELETE` on a frozen entry — or moving
  one into a closed period — return **409**. New pure
  `app/services/time-lock.js`.
- **Timesheet approval workflow** (#440). `TimeEntry.teApprovalStatus`
  (migration `20260608000000`, default `open`) tracks an entry through
  **open → submitted → approved / rejected** (a rejected entry may
  re-submit; approved is terminal). `POST /v1/timeentry/{id}/approval`
  with `{ action: submit|approve|reject }` applies the guarded transition
  (409 on an illegal one); both list routes accept `?approvalStatus=`.
  New pure `app/services/approval.js` state machine.
- **Audit log** (#460). An append-only `AuditLog` trail (migration
  `20260607000000`) — a `/v1` middleware records every **successful
  mutation** (POST/PATCH/PUT/DELETE) after the response is sent,
  fire-and-forget so it never blocks or breaks a request: actor
  (`master` or `company:<id>`), method, path, parsed entity, and status.
  `GET /v1/auditlog/bycompany/{id}` reads a company's trail (scoped),
  newest first, with `method` / `entity` filters + pagination.
- **Worker target hours & alerts** (#400). `Worker.workerTargetMinsPerWeek`
  (migration `20260606000000`, settable on worker create/PATCH) sets a
  weekly capacity target. New `GET /v1/report/targets?from=&to=` scales
  each target by the number of ISO weeks in the range, compares it to
  actual logged time, and flags `under` / `on` (±10%) / `over`, with an
  `underCount`. New pure `app/services/report-targets.js`.
- **Invoice currency** (#427). A per-company default currency
  (`compCurrency`, ISO-4217, defaults `USD`) and a per-invoice
  `invCurrency`; migration `20260605000000`. The roll-up stamps the
  invoice's currency (`currency` body override → company default), and
  the PDF formats every amount in it (symbol for common codes, else the
  code as a prefix). Settable on company + invoice create/PATCH.
  Records/displays currency — cross-currency FX conversion is out of
  scope.
- **Invoice summary vs detailed PDF** (#424) —
  `GET /v1/invoice/{id}/pdf?format=summary|detailed`. `detailed`
  (default) itemizes every line; `summary` collapses them into a single
  "Professional services (N items)" row at the same total. No schema
  change — a render option on the existing PDF endpoint.
- **Invoice branding & narratives** (#423). A per-company invoice footer
  (`compInvFooter`, settable on company create/PATCH) and a per-invoice
  note (`invNotes`, settable on invoice create/PATCH and via the roll-up
  body's `notes`); migration `20260604000000`. Both render on the invoice
  PDF — the note in a `NOTES` block above the footer, the company footer
  replacing the default line.
- **Budget vs actuals** (#434). Per-project budgets on Job —
  `jobBudgetMinutes` (effort) and `jobBudgetAmount` (value), migration
  `20260603000000`, settable on job create/PATCH. New
  `GET /v1/report/budget` sums each budgeted job's logged minutes +
  billable amount (via `rate.js`) and flags **each dimension**
  `under` / `near` (≥ 80%) / `over` (> 100%), with an `overCount`. New
  pure `app/services/report-budget.js`.
- **Timesheet aggregation** (#398) — `GET /v1/report/timesheet`. A
  hours-per-worker-per-**day** (`period=day`, default) or per-**week**
  (`period=week`, bucketed to the ISO Monday) grid over a date range,
  with per-worker row totals, per-period column totals, and a grand
  total. Company-scoped; optional `customerId` / `workerId` / `from` /
  `to`. New pure `app/services/report-timesheet.js`. First v1.2 item.
- **Billable vs non-billable summary** (#432) —
  `GET /v1/report/billable-summary`. Splits a company's tracked time into
  billable / non-billable minutes + hours **by month**, prices the
  billable portion (via `rate.js`), and reports the overall **billable
  ratio** and total billable amount — the utilization trend. Company-
  scoped; optional `customerId` / `from` / `to`. New pure
  `app/services/report-billable-summary.js`. **Completes the v1.1
  milestone.**
- **Tags on time entries** (#406). `TimeEntry.teTags` — a JSONB array of
  freeform labels (≤ 50 tags, each ≤ 64 chars), migration
  `20260602000000` with a GIN index. Settable on create / PATCH / timer
  start; the model getter normalizes null → `[]`. Both list routes
  (`bycompany`, `worker/{id}/timeentries`) accept `?tag=` to filter by a
  containing tag.
- **Per-project flat rate** (#410). `Job.jobFlatRate` (migration
  `20260601000000`) is an hourly rate applied to all time on the job —
  the **middle tier** of rate resolution in `rate.js`: per-entry
  `BillingType` override → **project flat rate** → worker default. It
  flows through the time-entry billing view, the invoice roll-up, and the
  unbilled report. Settable on job create/PATCH.
- **Worker time-list route** (#397) — `GET /v1/worker/{id}/timeentries`
  lists one worker's time entries, secure-404 scoped through the worker
  (missing / archived / cross-tenant read the same 404), with
  `customerId` / `from` / `to` filters and RFC-5988 pagination. No
  migration.
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
