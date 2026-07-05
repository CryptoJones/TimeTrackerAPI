# Backlog

This file and the GitHub **[Issues tab](https://github.com/CryptoJones/TimeTrackerAPI/issues)** are two views of the same list
and must stay in sync. Every backlog item below has a matching GitHub issue and vice
versa — when an item ships and its issue closes, check the box (or move it to `Done`)
here so neither side drifts.

## Engineering & hardening

- [ ] **TimeEntry: add POST /v1/timeentry/bulk for import parity** ([#379](https://github.com/CryptoJones/TimeTrackerAPI/issues/379))
- [ ] **Customer: consolidate GetCustomerCompanyId onto auth helper** ([#378](https://github.com/CryptoJones/TimeTrackerAPI/issues/378))
- [ ] **Auth: surface DB outage as 503 instead of 403** ([#377](https://github.com/CryptoJones/TimeTrackerAPI/issues/377))
- [ ] **TimeEntry: enforce teCompId integrity vs customer company** ([#376](https://github.com/CryptoJones/TimeTrackerAPI/issues/376))
- [ ] **Auth: document or align cross-tenant response codes (404 vs 403)** ([#375](https://github.com/CryptoJones/TimeTrackerAPI/issues/375))
- [ ] **Auth: use attachAuth context in controllers (eliminate duplicate DB lookups)** ([#374](https://github.com/CryptoJones/TimeTrackerAPI/issues/374))
- [ ] **TimeEntry create: validate teCustId belongs to effective company** ([#373](https://github.com/CryptoJones/TimeTrackerAPI/issues/373))
- [ ] **TimeEntry: resolve schema/API drift for job/worker/billtype fields** ([#372](https://github.com/CryptoJones/TimeTrackerAPI/issues/372))

## Product feature backlog (research-driven)

These items close the gap between the current API and a competitive consultant
time-tracking & billing product. They were sourced from Perplexity `deep_research`
across Harvest, Toggl Track, Clockify, FreshBooks, BigTime, My Hours, Rocketlane and
Wrike, then scoped against the live code (the core "track → bill → get paid" engine is
not yet built: time is not linked to a worker or rate, invoice amounts are entered by
hand, and there is no reporting, self-service auth, or frontend). Each item has a
matching GitHub issue and the two views stay in sync.

Legend: ⚠️ needs a frontend (the repo is API-only today) · ⛔ blocked on an external account.

### Billing core — the missing money engine

- [ ] **Billing-core: link TimeEntry to Worker (teWorkerId)** ([#385](https://github.com/CryptoJones/TimeTrackerAPI/issues/385)) · `v1.1`
- [ ] **Billing-core: link TimeEntry to Job (teJobId)** ([#386](https://github.com/CryptoJones/TimeTrackerAPI/issues/386)) · `v1.1`
- [ ] **Billing-core: rate resolution for time entries** ([#387](https://github.com/CryptoJones/TimeTrackerAPI/issues/387)) · `v1.1`
- [ ] **Billing-core: invoice money columns and exact-money service** ([#388](https://github.com/CryptoJones/TimeTrackerAPI/issues/388)) · `v1.1`
- [ ] **Billing-core: time-entry to invoice rollup** ([#382](https://github.com/CryptoJones/TimeTrackerAPI/issues/382)) · `v1.1`
- [ ] **Billing-core: invoice status and balance from payments** ([#389](https://github.com/CryptoJones/TimeTrackerAPI/issues/389)) · `v1.1`
- [ ] **Billing-core: configurable invoice numbering** ([#390](https://github.com/CryptoJones/TimeTrackerAPI/issues/390)) · `v1.1`
- [ ] **Billing-core: invoice PDF generation** ([#391](https://github.com/CryptoJones/TimeTrackerAPI/issues/391)) · `v1.1`

### Payments

- [ ] **Payments: allocate payments to invoices** ([#392](https://github.com/CryptoJones/TimeTrackerAPI/issues/392)) · `v1.1`
- [ ] **Payments: automated payment reminders and dunning** ([#393](https://github.com/CryptoJones/TimeTrackerAPI/issues/393)) · `v1.2`
- [ ] **Payments: online payment links via Stripe** ([#383](https://github.com/CryptoJones/TimeTrackerAPI/issues/383)) · `v2.0` ⛔
- [ ] **Payments: additional gateways (PayPal)** ([#394](https://github.com/CryptoJones/TimeTrackerAPI/issues/394)) · `v2.0`
- [ ] **Payments: gateway webhooks and reconciliation** ([#395](https://github.com/CryptoJones/TimeTrackerAPI/issues/395)) · `v2.0`

### Time capture

- [ ] **Time-capture: start/stop timer endpoints** ([#396](https://github.com/CryptoJones/TimeTrackerAPI/issues/396)) · `v1.1`
- [ ] **Time-capture: worker time-list route** ([#397](https://github.com/CryptoJones/TimeTrackerAPI/issues/397)) · `v1.1`
- [ ] **Time-capture: weekly and daily timesheet aggregation** ([#398](https://github.com/CryptoJones/TimeTrackerAPI/issues/398)) · `v1.2`
- [ ] **Time-capture: recurring-entry templates** ([#399](https://github.com/CryptoJones/TimeTrackerAPI/issues/399)) · `v1.2`
- [ ] **Time-capture: daily and weekly target hours with alerts** ([#400](https://github.com/CryptoJones/TimeTrackerAPI/issues/400)) · `v1.2`
- [ ] **Time-capture: idle detection and reminders** ([#401](https://github.com/CryptoJones/TimeTrackerAPI/issues/401)) · `v2.0` ⚠️
- [ ] **Time-capture: calendar integration (Google/Outlook)** ([#402](https://github.com/CryptoJones/TimeTrackerAPI/issues/402)) · `v2.0`
- [ ] **Time-capture: mobile capture** ([#403](https://github.com/CryptoJones/TimeTrackerAPI/issues/403)) · `v2.0` ⚠️
- [ ] **Time-capture: offline capture and sync** ([#404](https://github.com/CryptoJones/TimeTrackerAPI/issues/404)) · `v2.0` ⚠️
- [ ] **Time-capture: passive and AI-assisted suggestions** ([#405](https://github.com/CryptoJones/TimeTrackerAPI/issues/405)) · `v2.0` ⚠️

### Client / project / task structure

- [ ] **Structure: tags on time entries** ([#406](https://github.com/CryptoJones/TimeTrackerAPI/issues/406)) · `v1.1`
- [ ] **Structure: tasks and activities under jobs** ([#407](https://github.com/CryptoJones/TimeTrackerAPI/issues/407)) · `v1.2`
- [ ] **Structure: project phases and milestones as billing units** ([#408](https://github.com/CryptoJones/TimeTrackerAPI/issues/408)) · `v1.2`
- [ ] **Structure: custom fields on clients, projects, and entries** ([#409](https://github.com/CryptoJones/TimeTrackerAPI/issues/409)) · `v2.0`

### Billing rates

- [ ] **Billing-rates: per-project flat rate** ([#410](https://github.com/CryptoJones/TimeTrackerAPI/issues/410)) · `v1.1`
- [ ] **Billing-rates: per-task rate** ([#411](https://github.com/CryptoJones/TimeTrackerAPI/issues/411)) · `v1.2`
- [ ] **Billing-rates: role-based rates** ([#412](https://github.com/CryptoJones/TimeTrackerAPI/issues/412)) · `v1.2`
- [ ] **Billing-rates: client-specific rate cards and overrides** ([#413](https://github.com/CryptoJones/TimeTrackerAPI/issues/413)) · `v1.2`
- [ ] **Billing-rates: rate effective-dating** ([#414](https://github.com/CryptoJones/TimeTrackerAPI/issues/414)) · `v1.2`
- [ ] **Billing-rates: project-template billable rules** ([#415](https://github.com/CryptoJones/TimeTrackerAPI/issues/415)) · `v2.0`

### Expenses

- [ ] **Expenses: expense entity vs client, project, and job** ([#416](https://github.com/CryptoJones/TimeTrackerAPI/issues/416)) · `v1.1`
- [ ] **Expenses: billable expenses with markup** ([#417](https://github.com/CryptoJones/TimeTrackerAPI/issues/417)) · `v1.1`
- [ ] **Expenses: expenses roll into invoices** ([#418](https://github.com/CryptoJones/TimeTrackerAPI/issues/418)) · `v1.1`
- [ ] **Expenses: receipt attachment and upload** ([#419](https://github.com/CryptoJones/TimeTrackerAPI/issues/419)) · `v1.2`

### Invoicing

- [ ] **Invoicing: taxes (per-line and per-invoice)** ([#420](https://github.com/CryptoJones/TimeTrackerAPI/issues/420)) · `v1.1`
- [ ] **Invoicing: discounts and write-offs** ([#421](https://github.com/CryptoJones/TimeTrackerAPI/issues/421)) · `v1.1`
- [ ] **Invoicing: AR aging report** ([#422](https://github.com/CryptoJones/TimeTrackerAPI/issues/422)) · `v1.1`
- [ ] **Invoicing: branding and narratives** ([#423](https://github.com/CryptoJones/TimeTrackerAPI/issues/423)) · `v1.2` ⚠️
- [ ] **Invoicing: summary vs detailed formats** ([#424](https://github.com/CryptoJones/TimeTrackerAPI/issues/424)) · `v1.2`
- [ ] **Invoicing: recurring and scheduled invoices** ([#425](https://github.com/CryptoJones/TimeTrackerAPI/issues/425)) · `v1.2`
- [ ] **Invoicing: retainer management** ([#426](https://github.com/CryptoJones/TimeTrackerAPI/issues/426)) · `v1.2`
- [ ] **Invoicing: multi-currency** ([#427](https://github.com/CryptoJones/TimeTrackerAPI/issues/427)) · `v1.2`
- [ ] **Invoicing: fixed-fee and milestone billing models** ([#428](https://github.com/CryptoJones/TimeTrackerAPI/issues/428)) · `v1.2`

### Reporting & analytics

- [ ] **Reporting: revenue and earnings summary** ([#429](https://github.com/CryptoJones/TimeTrackerAPI/issues/429)) · `v1.1`
- [ ] **Reporting: unbilled billable-time report** ([#430](https://github.com/CryptoJones/TimeTrackerAPI/issues/430)) · `v1.1`
- [ ] **Reporting: hours by customer, job, and worker** ([#431](https://github.com/CryptoJones/TimeTrackerAPI/issues/431)) · `v1.1`
- [ ] **Reporting: billable vs non-billable summary** ([#432](https://github.com/CryptoJones/TimeTrackerAPI/issues/432)) · `v1.1`
- [ ] **Reporting: PDF and Excel export parity** ([#433](https://github.com/CryptoJones/TimeTrackerAPI/issues/433)) · `v1.2`
- [ ] **Reporting: budget vs actuals with alerts** ([#434](https://github.com/CryptoJones/TimeTrackerAPI/issues/434)) · `v1.2`
- [ ] **Reporting: utilization dashboard** ([#435](https://github.com/CryptoJones/TimeTrackerAPI/issues/435)) · `v1.2`
- [ ] **Reporting: project profitability and margin** ([#436](https://github.com/CryptoJones/TimeTrackerAPI/issues/436)) · `v1.2`
- [ ] **Reporting: per-client dashboards** ([#437](https://github.com/CryptoJones/TimeTrackerAPI/issues/437)) · `v2.0` ⚠️
- [ ] **Reporting: shareable client-facing links** ([#438](https://github.com/CryptoJones/TimeTrackerAPI/issues/438)) · `v2.0`
- [ ] **Reporting: scheduled report delivery** ([#439](https://github.com/CryptoJones/TimeTrackerAPI/issues/439)) · `v2.0`

### Approvals & controls

- [ ] **Approvals: timesheet submit, review, approve** ([#440](https://github.com/CryptoJones/TimeTrackerAPI/issues/440)) · `v1.2`
- [ ] **Approvals: locked periods** ([#441](https://github.com/CryptoJones/TimeTrackerAPI/issues/441)) · `v1.2`
- [ ] **Approvals: reminders and notifications** ([#442](https://github.com/CryptoJones/TimeTrackerAPI/issues/442)) · `v1.2`
- [ ] **Approvals: multi-level approval chains** ([#443](https://github.com/CryptoJones/TimeTrackerAPI/issues/443)) · `v2.0`

### Auth & accounts

- [ ] **Auth: self-service signup and user accounts** ([#444](https://github.com/CryptoJones/TimeTrackerAPI/issues/444)) · `v1.2`
- [ ] **Auth: login (session or JWT)** ([#445](https://github.com/CryptoJones/TimeTrackerAPI/issues/445)) · `v1.2`
- [ ] **Auth: password reset** ([#446](https://github.com/CryptoJones/TimeTrackerAPI/issues/446)) · `v1.2`
- [ ] **Auth: API-key rotation and lifecycle** ([#447](https://github.com/CryptoJones/TimeTrackerAPI/issues/447)) · `v1.2`
- [ ] **Auth: roles and permissions (RBAC)** ([#448](https://github.com/CryptoJones/TimeTrackerAPI/issues/448)) · `v2.0`
- [ ] **Auth: SSO (OAuth/SAML)** ([#449](https://github.com/CryptoJones/TimeTrackerAPI/issues/449)) · `v2.0`

### Integrations

- [ ] **Integrations: email and notification service (SMTP)** ([#450](https://github.com/CryptoJones/TimeTrackerAPI/issues/450)) · `v1.2`
- [ ] **Integrations: outbound webhooks** ([#451](https://github.com/CryptoJones/TimeTrackerAPI/issues/451)) · `v1.2`
- [ ] **Integrations: QuickBooks and Xero sync** ([#452](https://github.com/CryptoJones/TimeTrackerAPI/issues/452)) · `v2.0`
- [ ] **Integrations: PM tools (Jira/Asana/Trello)** ([#453](https://github.com/CryptoJones/TimeTrackerAPI/issues/453)) · `v2.0`
- [ ] **Integrations: Slack and Teams notifications** ([#454](https://github.com/CryptoJones/TimeTrackerAPI/issues/454)) · `v2.0`
- [ ] **Integrations: CRM (Salesforce/HubSpot)** ([#455](https://github.com/CryptoJones/TimeTrackerAPI/issues/455)) · `v2.0`
- [ ] **Integrations: payroll export** ([#456](https://github.com/CryptoJones/TimeTrackerAPI/issues/456)) · `v2.0`
- [ ] **Integrations: Zapier and open connectors** ([#457](https://github.com/CryptoJones/TimeTrackerAPI/issues/457)) · `v2.0`

### Team & resource management

- [ ] **Team: invite teammates to a workspace** ([#458](https://github.com/CryptoJones/TimeTrackerAPI/issues/458)) · `v2.0`
- [ ] **Team: capacity and resource planning** ([#459](https://github.com/CryptoJones/TimeTrackerAPI/issues/459)) · `v2.0`

### Compliance & security

- [ ] **Compliance: audit log** ([#460](https://github.com/CryptoJones/TimeTrackerAPI/issues/460)) · `v1.2`
- [ ] **Compliance: GDPR data export and delete** ([#461](https://github.com/CryptoJones/TimeTrackerAPI/issues/461)) · `v2.0`
- [ ] **Compliance: DCAA-grade audit trail** ([#462](https://github.com/CryptoJones/TimeTrackerAPI/issues/462)) · `v2.0`
- [ ] **Compliance: SOC 2 and security-posture roadmap** ([#463](https://github.com/CryptoJones/TimeTrackerAPI/issues/463)) · `v2.0`

### Web / UX & client portal

- [ ] **Web-UX: establish web frontend (SPA scaffold)** ([#384](https://github.com/CryptoJones/TimeTrackerAPI/issues/384)) · `v2.0` ⚠️
- [ ] **Web-UX: company settings page** ([#464](https://github.com/CryptoJones/TimeTrackerAPI/issues/464)) · `v2.0` ⚠️
- [ ] **Web-UX: dashboard home with KPIs** ([#465](https://github.com/CryptoJones/TimeTrackerAPI/issues/465)) · `v2.0` ⚠️
- [ ] **Web-UX: client portal** ([#466](https://github.com/CryptoJones/TimeTrackerAPI/issues/466)) · `v2.0` ⚠️

## Roadmap

| Milestone | Theme | Feature items |
|-----------|-------|---------------|
| `v1.1` | Billing core & capture | 23 |
| `v1.2` | Workflow, auth & insight | 31 |
| `v2.0` | Payments, integrations, frontend & scale | 31 |

## Done

<!-- Move shipped items here (or delete) as their issues close. -->

---

*Proudly Made in Nebraska. Go Big Red! 🌽 <https://xkcd.com/2347/>*
