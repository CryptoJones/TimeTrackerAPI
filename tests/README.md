# TimeTrackerAPI Tests

```bash
npm test            # one-shot run (CI mode)
npm run test:watch  # rerun on file changes
```

The suite uses [vitest](https://vitest.dev/) + [supertest](https://github.com/ladjs/supertest).
Runs in sub-two-second wall-clock across the unit + api tiers. The
integration suite auto-skips locally when no real Postgres is
reachable; CI runs a live `postgres:16-alpine` service alongside the
matrix so the full suite runs on every PR.

## Three tiers

The suite has three layers of test, each with a different cost +
coverage tradeoff:

- **`tests/unit/`** — pure-function and middleware tests. No HTTP,
  no DB, sub-millisecond per case. Cover the algorithmic surface
  (hash builders, scope generators, request-id derivation, etc.).
- **`tests/api/`** — HTTP-level tests via supertest against the
  router. DB is mocked at the `db.config.js` module level. Cover
  the request/response contract: status codes, headers, body
  validation, route mounting, middleware ordering.
- **`tests/integration/`** — real Postgres round-trips. Verify
  Sequelize models, the migration chain, and the full HTTP → DB
  path. Auto-skip when no DB is reachable; CI runs them on
  every PR. See [`tests/integration/README.md`](integration/README.md)
  for the bring-up flow.

## Conventions

- **No live database in `unit/` or `api/`.** Tests `vi.mock`
  `app/config/db.config.js` before importing app modules so the
  suite runs hermetically.
- **`_setDbForTesting` seam** (P5-M, see
  `app/middleware/auth.js` and `app/middleware/idempotency.js`).
  vitest's `vi.mock` does not reliably intercept this codebase's
  CJS `require()` chains. Modules that need to drive "row found"
  success paths from tests expose a `_setDbForTesting(stub)` setter
  that swaps in a caller-controlled db substitute. Tests call it
  in `beforeEach` and reset in `afterEach`. Production code MUST
  NOT call the setter.
- **`require()` not `await import()` for auth modules.** vitest's
  CJS/ESM bridge can hand back distinct instances for the two
  forms; using `require()` ensures tests hit the same module the
  router-imported middleware uses.
- **`test.fails` for known bugs.** Pin a regression as
  `test.fails(...)` so the suite stays green while the bug is
  open. Once fixed, the test starts passing — vitest then fails
  the `test.fails` (because the expected failure didn't happen)
  and the dev flips it to plain `test`. Currently no `test.fails`
  in tree.

## Adding a test

1. Drop a new `*.test.js` under the right tier (`unit/`, `api/`,
   or `integration/`).
2. For `api/` tests, `vi.mock('../../app/config/db.config.js', …)`
   at module scope before any other imports.
3. Build the Express app from the same `app/routers/router.js`
   the production server uses; mount only the middleware your
   test needs (see `tests/api/server-boots.test.js` if you need
   the FULL middleware chain).
4. If you need the auth or idempotency middleware to take a
   particular DB-derived branch, install a fixture via
   `_setDbForTesting()` rather than fighting `vi.mock`.

## Adding to the integration tier

See [`tests/integration/README.md`](integration/README.md) — the
key constraint is that every test must clean up rows it inserts
via a unique sentinel value, so a crash mid-run doesn't poison
the next run.

## Server-boot smoke test

`tests/api/server-boots.test.js` spawns the real `node server.js`
process and waits for "Server listening" within 15s. This catches
startup-time validators (express-rate-limit's IPv6 helper check,
helmet option validation, etc.) that the inline-express api tests
never exercise — added after a real bypass (ERR_ERL_KEY_GEN_IPV6)
slipped through that gap.
