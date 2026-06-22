# TimeTrackerAPI — Product Backlog (100,000-m view)

*From a technically-complete API to a sellable product.*

---

## 0. Where it stands today

**You already have a genuinely strong technical foundation** — most "sellable
SaaS" checklists are half-done out of the gate here:

| Already done (a real selling point / de-risk) | Why it matters commercially |
|---|---|
| Company-scoped multi-tenancy + secure-404 isolation | The hardest thing to retrofit — done right already |
| Idempotency keys | **Prerequisite for billing** — safe retries on money-moving calls |
| Rate-limiting (per-key + per-IP) | Becomes per-plan quota enforcement with little extra |
| OpenAPI 3.0 + Swagger + Postman | Feeds SDK generation, a docs portal, and DX |
| Prometheus metrics, `/healthz`, structured logs | The skeleton of an SRE/observability story |
| Signed multi-arch images + SBOM + release pipeline | Enterprise supply-chain trust, already shipping |
| Soft-delete everywhere | Foundation for data-retention / GDPR erasure |
| Apache-2.0, self-hostable, Docker | Matches your open-source model (OSApplyTrack pattern) |

**The one-sentence gap:** it is an excellent *data API* with **no commercial
layer** — no way to sign up, pay, be metered, manage credentials, or self-serve —
and the **core domain value (turning tracked time into billed invoices) is
modeled but not yet a complete workflow**. Those two gaps are the product.

---

## 1. Decisions locked (2026-06-22)

The four strategic forks are decided. These drive everything below:

| Fork | Decision | What it means for the build |
|---|---|---|
| Monetization | **Open-core + managed hosting** | Code stays Apache-2.0 + self-hostable (free). Revenue = a paid managed cloud instance (subscription) — build a billing/subscription layer for the hosted tier, not a license wall. |
| Product shape | **Build the end-user UI** | The web app *is* the product (freelancers won't integrate an API). The existing API becomes the backend; a user-facing web app is now a **Tier-0** deliverable. |
| Payment scope | **Invoice + full/partial payments + balance-forward** | Payment *tracking* (A/R), not card processing: invoice lifecycle, apply full/partial payments, compute running balance/aging, and generate a follow-up invoice carrying the outstanding balance. |
| First segment | **Freelancers** | Solo users; one person = one workspace. Optimize for fast signup + simplicity. **De-prioritizes** RBAC, SSO, and SOC2-grade compliance for v1. |

**Effect on the tiers below:** the end-user **Web UI (was T2-5)** and a new
**human-account/auth layer** are promoted into Tier-0; **RBAC (T1-1), SSO
(T1-9), and SOC2-grade compliance (T1-6/7)** drop out of the v1 path. The
invoicing epic (T0-2) expands to cover the payments/balance-forward requirement
— detailed in **Appendix A**.

---

## 2. The backlog

Tiered by "what's required to charge money," not by effort. Tags: **impact** ·
rough size (S/M/L/XL).

### Tier 0 — Cannot charge a dollar without these (*path to first revenue*)

| # | Epic | What it is | Why it's required to sell | Size |
|---|---|---|---|---|
| T0-1 | **Tenant self-service & API-key management** | Signup/provisioning flow; an API + UI to issue, name, rotate, and revoke multiple keys per tenant; suspend/reactivate accounts. Today there's only a single static `authKey` per company and master-key provisioning. | No one can onboard themselves or rotate a leaked key → no self-serve sales | L |
| T0-2 | **Complete the invoicing loop (the actual value)** | Auto-compute invoice-line amounts from `teMinutes × BillingType rate` (the FKs now exist); invoice generation (numbering, status workflow, PDF); wire `CustomerPayment` into balance/aging. | "Track time → send an invoice → get paid" is the product; today it's disconnected tables | XL |
| T0-3 | **Monetization spine** | Plans/tiers, **usage metering**, billing integration (**recommend Stripe Billing — don't build it**), per-plan quota enforcement (reuse rate-limit), subscription lifecycle (trial → upgrade → dunning → cancel). | Literally how money is collected | L |
| T0-4 | **Operator/admin console** | Manage tenants, keys, plans; view usage; suspend abusers; impersonate (audited) for support. | Can't run a paid service blind | M |
| T0-5 | **Managed hosting** | A real hosted environment (not just docker-compose): provisioning, TLS, per-tenant DB/schema isolation strategy, zero-downtime deploy. | The thing customers actually pay to use | L |
| T0-6 | **Commercial/legal table-stakes** | Pricing definition, Terms of Service, Privacy Policy, DPA, support SLA doc. | Can't transact B2B without them | S |

### Tier 1 — Needed to retain customers & close real B2B deals

| # | Epic | What it is | Why it matters | Size |
|---|---|---|---|---|
| T1-1 | **RBAC / scoped permissions** | Roles beyond binary master-vs-company (admin / manager / read-only / billing); per-key scopes. | Every team buyer asks "can I give read-only access?" | M |
| T1-2 | **Audit logging** | Immutable who-did-what-when across tenant actions + admin impersonation. | Hard requirement for enterprise + compliance | M |
| T1-3 | **Webhooks / events** | Push `invoice.created`, `payment.received`, etc., with signed delivery + retries. | Integrators can't poll forever; unlocks ecosystem | M |
| T1-4 | **SRE & SLA story** | Alerting, dashboards, **status page**, error budgets, OTEL tracing (plan S3), on-call, documented uptime SLA. | You're selling reliability; must prove it | L |
| T1-5 | **Backups / DR** | Tested restore, PITR, documented RPO/RTO. | One unrecoverable outage ends the business | M |
| T1-6 | **Security for procurement** | Third-party pen-test, SAST + image scanning in CI (plan S3), secrets management, encryption-at-rest verification, SOC 2 path. | Security questionnaires gate enterprise deals | L |
| T1-7 | **Compliance / data rights** | GDPR/CCPA data export + erasure (soft-delete helps), data-residency story, PII inventory. | Legal exposure + EU/CA customers | M |
| T1-8 | **Developer experience** | Generated **SDKs** (TS/Python) from OpenAPI, API versioning + deprecation policy, **sandbox/test mode**, error-code reference, hosted docs portal. | For an API product, DX *is* the product | M |
| T1-9 | **Auth modernization** | OAuth2/OIDC or at least scoped tokens; SSO (SAML/OIDC) as a paid enterprise feature. | "API key in a header" alone caps deal size | L |

### Tier 2 — Differentiation, growth, expansion revenue

| # | Epic | What it is | Why it matters | Size |
|---|---|---|---|---|
| T2-1 | **Accounting integrations** | QuickBooks / Xero / Stripe-payments / Slack. | Invoicing products live or die on accounting sync | L |
| T2-2 | **Reporting & analytics suite** | Build on the new `invoice-list` report: time-by-job/customer, A/R aging, utilization dashboards, scheduled exports. | Buyers want insight, not just storage | M |
| T2-3 | **Invoicing domain depth** | Multi-currency, tax/VAT, recurring invoices, estimates/quotes, expense tracking, approval flows. | Moves you upmarket from freelancers to agencies | L |
| T2-4 | **Scale-out** | Read replicas, caching, async job queue for bulk ops + PDF/report generation, multi-region. | Needed as tenants/volume grow | L |
| T2-5 | **End-user UI** (if positioning #2) | Web app for time entry + invoicing + a customer billing portal. | Broadens buyer beyond developers | XL |
| T2-6 | **Growth loops** | Guided onboarding, sample data, templates, in-product usage→upgrade prompts. | Converts trials → paid, drives expansion | M |

---

## 3. Critical path to v1 (the sellable freelancer product)

Re-cut for the four decisions. Ordered; each builds on the last.

1. **Human accounts & auth layer** — freelancer signup / login (email+password
   or magic-link), password reset, session/JWT, user ↔ workspace (`Company`)
   mapping. The current `authKey` model is for API integrators; the web app
   needs real user accounts. *(New Tier-0 item.)*
2. **Invoicing & payments engine (backend)** — the core value; detailed in
   **Appendix A**. Auto-bill time × rate → invoice lines, invoice lifecycle,
   full/partial payment recording, running balance/aging, balance-forward
   re-invoicing, PDF.
3. **End-user web app** — login, time tracking (start/stop + manual), clients &
   jobs, build/send invoices, record payments, balance dashboard. Recommend a
   single SPA (React or Svelte) on the existing API; ship the freelancer
   happy-path first.
4. **Subscription billing (Stripe Billing)** — charge for the managed-hosting
   tier; trial → paid → dunning; enforce plan limits (reuse the rate-limiter).
5. **Managed hosting + onboarding + legal** — provisioned cloud instance,
   signup→workspace automation, ToS/Privacy/DPA, sample-data onboarding.
6. **Design-partner freelancers** on the free/discounted tier; let their
   friction order Tiers 1–2.

---

## 4. Remaining questions (not blocking the start)

- **Invoice delivery:** send invoices by email from the app (needs an email
  sender) or just generate the PDF for the freelancer to send themselves?
- **Hosted vs self-host parity:** is the paid tier purely "we run it for you,"
  or does it also gate a couple of hosted-only conveniences (managed email, PDF
  storage)? (Sets the open-core boundary.)
- **Pricing shape:** flat per-month, or metered by clients / invoices / volume?
- **UI stack:** any preference (React / Svelte / plain), or my call?

---

## Appendix A — Detailed plan: Invoicing & Payments engine (Tier-0)

The core value loop, scoped to your payment requirements. Backend only — the
web app (critical-path step 3) sits on top. Built **additively** on the existing
`Invoice` / `InvoiceJob` / `CustomerPayment` / `Job` / `TimeEntry` /
`BillingType` tables; company-scoped with the same secure-404 + idempotency
patterns already in the codebase.

### A.1 Data-model changes (migrations, additive/nullable)
- **`CustomerPayment.cpayInvId`** (nullable FK → Invoice). Today a payment
  attaches only to a customer; to track an invoice balance a payment must apply
  to a specific invoice. Nullable so account-level credits still work.
- **`Invoice.invStatus`** (`draft` / `sent` / `partial` / `paid` / `void`) as the
  status source of truth (the current boolean `invPaid` can't represent
  partial); keep `invPaid` as a derived mirror or migrate it out.
- **`Invoice.invBalanceForwardFrom`** (nullable FK → Invoice) linking a
  balance-carried invoice to its predecessor.
- *(Optional, anti-double-bill)* **`TimeEntry.teInvoiceJobId`** (nullable FK →
  InvoiceJob) so billed hours can't be billed twice. Alternative: bill at the
  job level via the existing `Job.jobInvoiced` flag.

### A.2 Money math (one small, heavily-tested service module)
- `invoiceTotal` = Σ `injbAmount` of the invoice's lines.
- `invoicePaid` = Σ `cpayAmount` where `cpayInvId = invId`.
- `invoiceBalance` = total − paid; status derives from it (paid when balance ≤ 0,
  partial when 0 < paid < total).
- **Move money off `float`.** Amount columns (`injbAmount`, `cpayAmount`,
  `btHourlyRate`) are `float` today — a latent rounding bug for a billing
  product. Migrate to `numeric`/decimal (or centralize integer-cents rounding in
  this module). **Flagged as a real correctness issue.**

### A.3 Endpoints (company-scoped; idempotent on writes that move money)
- `POST /v1/invoice/from-job/:jobId` — auto-bill: gather billable, un-invoiced
  TimeEntries on the job, compute hours × rate (`teBillTypeId` → BillingType,
  else worker/job default), create the Invoice + InvoiceJob line, mark the hours
  consumed.
- `POST /v1/invoice/:id/payment` — record a full or partial payment
  (`{ amount, date, description }`); writes a `CustomerPayment` with `cpayInvId`,
  recomputes balance + status.
- `GET /v1/invoice/:id` (extend) — include total, paid, balance, status, lines,
  payments.
- `POST /v1/invoice/:id/carry-forward` — new invoice for the same customer with a
  "Balance brought forward" line = the prior invoice's outstanding balance,
  linked via `invBalanceForwardFrom`; optionally void/close the old one.
- `GET /v1/invoice/:id/pdf` — render the invoice (HTML template → headless PDF):
  the freelancer's deliverable.
- `GET /v1/report/aging` — A/R aging buckets (0-30/31-60/61-90/90+) per customer,
  built on the balance math (extends the new reporting surface).

### A.4 Tests
- Money-module unit tests: rounding, partial payments, zero/over-payment.
- API tests: auto-bill line amount; partial → `partial` + balance; full →
  `paid`; carry-forward links + brought-forward amount; double-bill guard.
- Integration test (real PG) for the multi-table payment/invoice transaction.

### A.5 Sequencing (each a patch release per the per-work-unit cadence)
1. Money module + `cpayInvId` migration + balance/status on `GET /v1/invoice/:id`.
2. `POST /v1/invoice/:id/payment` (full + partial).
3. `POST /v1/invoice/from-job/:jobId` (auto-bill from time).
4. `POST /v1/invoice/:id/carry-forward` + aging report.
5. `GET /v1/invoice/:id/pdf`.

*Proudly Made in Nebraska. Go Big Red! 🌽 <https://xkcd.com/2347/>*
