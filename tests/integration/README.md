# Integration tests

These tests hit a **real PostgreSQL database**, not the mocked one
the unit/API tests use. They verify Sequelize models, the migration
chain, and the full HTTP → DB round-trip that the mocks can't cover.

## Running them

```bash
# 1. Bring up a Postgres on localhost:5432 (any method).
docker compose up -d postgres setup

# 2. Apply migrations on top of the SQL bootstrap.
npm run migrate

# 3. Run the integration suite.
DB_HOST=localhost DB_PORT=5432 DB_NAME=timetracker \
    DB_USERNAME=timetracker DB_PASSWORD=... \
    npx vitest run tests/integration
```

Tests **automatically skip** when:
- `DB_PASSWORD` is empty / unset, or
- The Sequelize `authenticate()` call fails

This means `npm test` (the default unit + API suite) still runs
clean against the mock without needing a live database.

## Conventions

- Every integration test must clean up rows it inserts. Use a
  unique sentinel value (e.g. `_integ_test_${Date.now()}`) so a
  bad cleanup doesn't poison subsequent runs.
- Never run integration tests against a production database.
  The cleanup pattern is defensive but not bulletproof.
- Tests are intentionally narrow — they verify the
  bridge between Sequelize, the schema, and the HTTP layer.
  Heavyweight behavior testing belongs in the mocked API tests.
