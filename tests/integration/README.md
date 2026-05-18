# Integration tests

These tests hit a **real PostgreSQL database**, not the mocked one
the unit/API tests use. They verify Sequelize models, the migration
chain, and the full HTTP → DB round-trip that the mocks can't cover.

## Quick bring-up (docker compose)

The repo ships a `docker-compose.override.yml` that exposes
Postgres on `127.0.0.1:5432` for host-side test runs. Without
the override, the `postgres` service is reachable only from
other compose services (deliberate hardening for production).

```bash
# 1. .env must define DB_PASSWORD. Copy from .env.example and set
#    something. Any value is fine — this is a throwaway DB.
cp .env.example .env
# edit .env: set DB_PASSWORD=…

# 2. Bring up the stack. The override auto-applies because docker
#    compose loads docker-compose.override.yml by default.
sudo docker compose up -d postgres setup migrate
sudo docker compose ps -a   # postgres: healthy, setup/migrate: Exited (0)

# 3. Run the integration suite with DB vars set.
export DB_HOST=localhost DB_PORT=5432 DB_NAME=timetracker DB_USERNAME=timetracker
export DB_PASSWORD=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)
npx vitest run tests/integration

# 4. Tear down when done. `-v` removes the volume so the next
#    bring-up starts from an empty schema (see "Known gotchas").
sudo docker compose down -v
```

## Known gotchas

- **`docker-compose.override.yml` opens port 5432 on the host.**
  Fine for local dev; do not push the override file's port
  binding to a public host without firewall rules — Postgres on
  the open internet is a credential-brute-force invitation.
- **Re-running `setup` against an existing volume is safe** since
  PR #57 made `setup/TimeTracker.sql` idempotent. Step 4's
  `down -v` is for "I want a fresh database" cleanup, not a
  workaround.

## Without docker

Any reachable Postgres works — set the four `DB_*` env vars and
make sure `setup/TimeTracker.sql` + `setup/TimeEntry.sql` + the
migrations have been applied. The tests don't care how the DB
got there.

## Skip behavior

Tests **automatically skip** when:
- `DB_PASSWORD` is empty / unset, or
- The Sequelize `authenticate()` call fails

This means `npm test` (the default unit + API suite) still runs
clean against the mock without needing a live database.

## Conventions

- Every integration test must clean up rows it inserts. Use a
  unique sentinel value (e.g. `_integ_<pid>_<timestamp>`) so a
  bad cleanup doesn't poison subsequent runs.
- Never run integration tests against a production database.
  The cleanup pattern is defensive but not bulletproof.
- Tests are intentionally narrow — they verify the bridge
  between Sequelize, the schema, and the HTTP layer.
  Heavyweight behavior testing belongs in the mocked API tests.
