# Contributing to TimeTrackerAPI

The project mirrors on [GitHub](https://github.com/CryptoJones/TimeTrackerAPI)
and [Codeberg](https://codeberg.org/CryptoJones/TimeTrackerAPI). PRs and
issues on either forge are welcome; commits are pushed to both.

For vulnerability reports, see [`SECURITY.md`](SECURITY.md) — those use
private channels, NOT public issues.

## Quick start

```bash
git clone https://github.com/CryptoJones/TimeTrackerAPI.git
cd TimeTrackerAPI
cp .env.example .env
# edit DB_PASSWORD in .env (see .env.example for the full env knob list)

npm ci
docker compose up -d postgres setup       # local Postgres + schema bootstrap
npm run migrate                            # apply all sequelize migrations
npm test                                   # unit + api + integration
npm start                                  # serves on PORT (default 3000)
npm run dev                                # same, but auto-reloads on app/ + server.js edits
```

`npm test` runs the full vitest suite (45+ files, 479+ cases at this
writing). The integration suite (`tests/integration/`) auto-skips when
no Postgres is reachable, so a fresh `npm test` without docker still
passes the unit + api tiers.

## Before you open a PR

- **`npm run lint`** — eslint flat-config (`no-unused-vars`, `eqeqeq`,
  `no-console`, etc.). CI gates on this.
- **`npm test`** — the full suite must pass. New features that touch
  controllers / middleware should land with new tests covering the
  happy + 4xx paths.
- **`npm run audit`** — `npm audit --audit-level=high --omit=dev`.
  CI fails on any high/critical advisory affecting production deps.
- **OpenAPI:** if you add or change an endpoint, update
  `app/config/openapi.js` (Swagger UI at `/docs` reads from it, and
  the Postman collection is generated from it via
  `openapi-to-postmanv2` — see [README.md](README.md) for the
  one-liner).
- **CHANGELOG.md:** add a one-paragraph entry under `[Unreleased]`
  describing what changed and (briefly) why.

## Commit style

Conventional-commit-ish: subject begins with `feat:`, `fix:`, `chore:`,
`refactor:`, `docs:`, `test:`, or `ci:` followed by a scope in parens
when useful (`feat(api):`, `fix(server):`). Body explains the why,
not just the what. Multi-paragraph is fine for non-trivial changes.

If you co-author with an AI assistant, add a `Co-Authored-By:` trailer
naming the model + the tool — keeps attribution honest for downstream
forks.

## What gets reviewed

- **Auth scoping.** Every new endpoint that touches a domain entity
  must enforce the right `getCompanyId*` helper in
  [`app/middleware/auth.js`](app/middleware/auth.js) — direct, customer,
  job, vendor, or header-scoped. Master vs non-master semantics need
  to be explicit in the controller.
- **Input validation.** Bodies go through `zod`-strict whitelists
  in [`app/schemas/`](app/schemas). Unknown fields are rejected, not
  silently stripped.
- **Soft-delete.** Models with an `*Arch` column carry
  `defaultScope: { where: { *Arch: false } }`. Archived rows are
  invisible to reads by default; ops that need to see them must
  `.unscoped()` explicitly.
- **No raw SQL** when a model call works. The `app/middleware/auth.js`
  P5-M refactor is the precedent: model methods are mockable,
  raw `sequelize.query` is not.
- **Logger.** Anything that previously called `console.*` outside
  startup should route through `app/config/logger.js` (`log.info`,
  `log.warn`, etc.) — that's what feeds the structured request log,
  redaction layer, and OTEL future.
- **Tests.** New code lands with tests. The `_setDbForTesting` seam
  on `auth.js` + `idempotency.js` lets HTTP tests drive success
  paths without a real DB; use it instead of integration-only
  coverage when possible.

## What you DON'T need

- A signed CLA. The project is Apache-2.0 and contributions are
  accepted under the same terms.
- A particular Node version, beyond the engines pin
  (`>=20.0.0`). The CI matrix tests against Node 20 and 22.
- A particular IDE / editor. Just match the existing whitespace
  conventions (4-space indent in JS, 2-space in YAML).

## Where to start

- Look at issues labelled `good first issue` on either forge.
- Run the test suite locally and read the test file headers — they
  document the conventions used across the codebase (vi.mock
  caveats, how master-vs-scoped is exercised, etc.).
- Skim [`CHANGELOG.md`](CHANGELOG.md) — every architectural decision
  has a short rationale paragraph.

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
