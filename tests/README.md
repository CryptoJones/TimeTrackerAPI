# TimeTrackerAPI Tests

```bash
npm test            # one-shot run (CI mode)
npm run test:watch  # rerun on file changes
```

The suite uses [vitest](https://vitest.dev/) + [supertest](https://github.com/ladjs/supertest).

## What's covered

| File | What it asserts |
|---|---|
| `api/customer.test.js` | `GET /v1/customer/:id` returns 403 when `authKey` is missing; route is mounted correctly. |
| `api/customer-bycompany.test.js` | `GET /v1/customer/bycompany/:id` route is mounted; **regression-pinned test for issue #3** uses `test.fails` to detect when the missing auth check on this endpoint is fixed upstream. |

## Conventions

- **No live database.** Tests mock `app/config/db.config.js` so the suite runs
  hermetically. Adding tests that need real Postgres would require an
  integration runner — out of scope for this fast suite.
- **`test.fails` for known bugs.** When a known production bug is captured as
  a regression test, use `test.fails(...)` so the suite stays green while
  the bug is open. Once the bug is fixed, the test will start passing — at
  which point vitest will fail the `test.fails` (because the expected failure
  didn't happen) and the dev who applied the fix flips it to plain `test`.

## Adding a test

1. Drop a new `*.test.js` in `tests/api/` (or a sibling directory).
2. Mock `app/config/db.config.js` via `vi.mock` at module scope before
   importing any of the app's modules.
3. Build the Express app from the same router the production server uses,
   then drive it with supertest.
