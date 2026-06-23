<p align="center"><em>Proudly Made in Nebraska. Go Big Red! 🌽 <a href="https://xkcd.com/2347/">https://xkcd.com/2347/</a></em></p>

# TimeTracker Web

The end-user web app for [TimeTrackerAPI](../) — a React (Vite) SPA for
freelancers to track time, manage clients & jobs, and bill invoices.

## Develop

```bash
cd web
npm install
npm run dev          # http://localhost:5173, proxies /v1 → http://localhost:3000
```

Point the dev proxy at a different API with `VITE_API_URL`:

```bash
VITE_API_URL=http://localhost:3000 npm run dev
```

Run the API alongside it (`npm start` in the repo root, with a database).

## Build

```bash
npm run build        # static files in web/dist/
```

In production the built `dist/` is served from the same origin as the API,
so `/v1` resolves as a same-origin relative path (no CORS).

## Auth model

Signup/login return a company **session API key**, stored in
`localStorage` and sent as the `authKey` header on every request — the
same credential the rest of the API already understands.

## Status

- ✅ Auth (signup / login / logout / me) + app shell
- ⏳ Time tracking · clients & jobs · invoices & payments · reports

---

*Proudly Made in Nebraska. Go Big Red! 🌽 <https://xkcd.com/2347/>*
