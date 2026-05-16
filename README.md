# TimeTrackerAPI

Open-source rewrite of Atbash Services' TimeTrackerAPI on **Node.js + PostgreSQL**.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Codeberg](https://img.shields.io/badge/Codeberg-CryptoJones%2FTimeTrackerAPI-2185D0?logo=codeberg&logoColor=white)](https://codeberg.org/CryptoJones/TimeTrackerAPI)
[![GitHub](https://img.shields.io/badge/GitHub-CryptoJones%2FTimeTrackerAPI-181717?logo=github&logoColor=white)](https://github.com/CryptoJones/TimeTrackerAPI)

> Mirrored on both [GitHub](https://github.com/CryptoJones/TimeTrackerAPI) and
> [Codeberg](https://codeberg.org/CryptoJones/TimeTrackerAPI). Issues filed
> on either forge are welcome; commits are pushed to both.

Working example at [node.timetrackerapi.com](http://node.timetrackerapi.com).

## Endpoints

| Endpoint                            | Auth required | Description                                  |
|-------------------------------------|---------------|----------------------------------------------|
| `GET /healthz`                      | no            | Liveness + DB-readiness probe (returns `{status, db, uptime_s, version, elapsed_ms}`; 200 ok / 503 degraded). |
| `GET /v1/customer/:id`              | yes (`authKey`) | Single customer lookup. Master key sees all; non-master only sees customers in its own company. |
| `GET /v1/customer/bycompany/:id`    | yes (`authKey`) | All customers in a company. Master sees any; non-master only its own. |
| `POST /v1/customer`                 | yes (`authKey`) | Create a customer. Master key may target any `custCompId`; non-master keys can only create within their own company (and `custCompId` defaults to that). Returns 201 + the created customer. |

Every v1 request must include the API key in the `authKey` HTTP header.
The `/healthz` endpoint is intentionally unauthenticated so it can be
hit by orchestrators (Docker `HEALTHCHECK`, Kubernetes liveness, uptime
monitors) without sharing a credential.

![example image](https://github.com/CryptoJones/TimeTrackerAPI/blob/master/setup/postman_example.PNG?raw=true)

*(authKey example using Postman)*

---

## Requirements

- **Node.js 18+** (tested on 20 and 22)
- **PostgreSQL 14+**
- A modern Linux distribution (any currently supported LTS — Ubuntu 22.04 / 24.04, Debian 12, RHEL 9, etc.)

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/CryptoJones/TimeTrackerAPI.git
cd TimeTrackerAPI

# 2. Install dependencies (no sudo)
npm install

# 3. Provision the database
sudo -u postgres psql <<'SQL'
CREATE USER timetracker WITH PASSWORD 'change-me-strong-password';
CREATE DATABASE timetracker WITH OWNER timetracker;
SQL
sudo -u postgres psql -d timetracker -f setup/TimeTracker.sql

# 4. Configure environment
cp .env.example .env
$EDITOR .env       # set DB_PASSWORD, optionally PORT / CORS_ORIGIN

# 5. Run
npm start
```

The server listens on `http://0.0.0.0:3000` by default. No root required.

---

## Environment variables

All configuration lives in environment variables (loaded from `.env`
locally via `dotenv`, or set directly by your process manager in
production). See `.env.example` for the canonical reference.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port. Use a non-privileged port (>1024). |
| `HOST` | `0.0.0.0` | Bind address. `127.0.0.1` for localhost-only. |
| `CORS_ORIGIN` | (unset → disabled) | Comma-separated list of allowed origins, e.g. `https://app.example.com,https://admin.example.com`. Leave unset to disable cross-origin requests entirely. |
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_NAME` | `timetracker` | Database name. |
| `DB_USER` | `timetracker` | Database user (must have access to the `dbo` schema). |
| `DB_PASSWORD` | (empty) | Database password. **Required.** Setting it empty will cause connection failures and a startup warning. |

`.env` is gitignored. Never commit a populated `.env`.

---

## Security notes

- **Do not run this service as root.** The default port (`3000`) is
  non-privileged on purpose. If you need to expose the API on `:443`,
  put nginx, Caddy, or another reverse proxy in front and terminate TLS
  there.
- **Rotate the `authKey` regularly** and limit which users have access
  to the `apikey` / `apimaster` tables.
- **Use a strong, unique `DB_PASSWORD`** and restrict the database user
  to the minimum required privileges — `SUPERUSER` is convenient for
  local development but should not be the production grant.

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
