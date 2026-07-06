# Security policy

Thank you for taking the time to look at the security of TimeTrackerAPI.
The project mirrors on both [GitHub](https://github.com/CryptoJones/TimeTrackerAPI)
and [Codeberg](https://codeberg.org/CryptoJones/TimeTrackerAPI); either
forge is a valid place to reach us.

> For the project's **implemented security controls** and a **SOC 2
> readiness roadmap** (a companion to this disclosure policy), see
> [`docs/SECURITY-POSTURE.md`](docs/SECURITY-POSTURE.md).

## Supported versions

This is a single-track project. Security fixes land on `master` only;
there are no maintained release branches. Operators deploying from a
tagged release should bump to the latest tag (or `master`) when a
vulnerability lands, then re-deploy.

## Reporting a vulnerability

**Please do NOT open a public issue for a security vulnerability.**

Instead, use one of these channels:

- **GitHub:** open a private vulnerability report via
  [GitHub Security Advisories](https://github.com/CryptoJones/TimeTrackerAPI/security/advisories/new).
  This is the preferred path for anything that warrants a CVE.
- **Codeberg:** post a private message to `@CryptoJones` (the repo
  owner) and include the word `SECURITY` in the subject line.
- **Email:** as a last resort, send the report to the email address
  listed on the maintainer's GitHub profile, with `[security]` in the
  subject line.

We aim to:

- **Acknowledge** receipt within **3 business days**.
- **Triage** (confirm + assign a severity) within **7 business days**.
- **Ship a fix or mitigation** within **30 days** for high/critical
  issues; lower severities are best-effort.

Please include in your report:

- A clear description of the vulnerability and its impact.
- Steps to reproduce (or a proof-of-concept payload).
- Affected commit / tag, if you can identify one.
- Your preferred attribution name + link for the changelog credit
  (or "anonymous" if you'd rather we not name you).

## What's in scope

- The HTTP API in `app/` and `server.js`.
- The Sequelize models and migrations in `app/models/` and
  `app/migrations/`.
- The default Docker / docker-compose configuration in the repo root.
- The dependency tree in `package.json` (we run `npm audit` on
  production deps in CI; a high/critical advisory against a deployed
  dependency is in scope even if our code doesn't trigger the bug).

## What's out of scope

- Vulnerabilities that require the operator to deliberately mis-configure
  the deployment (e.g., `RATE_LIMIT_MAX=0` on a public endpoint, or
  running the server as root inside the container).
- Findings that depend on the operator running a fork with material
  modifications.
- DoS via cost-amplification on a non-rate-limited route the operator
  has explicitly mounted (e.g., a custom `/admin/*` endpoint outside
  this repo's surface).
- Issues in third-party dependencies that have already been disclosed
  upstream and don't have a fix available — please report those
  upstream and link us to the tracking issue.

## Public disclosure timeline

Once a fix has landed on `master` and an advisory has been published,
we'll credit the reporter (unless they asked otherwise) and reference
the GitHub Security Advisory ID in the changelog entry. We coordinate
disclosure timing with the reporter when the issue is severe enough
to warrant a heads-up to known deployers.

Proudly Made in Nebraska. Go Big Red! 🌽 https://xkcd.com/2347/
