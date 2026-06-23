# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Aaron K. Clark
#
# Multi-stage Dockerfile for TimeTrackerAPI.
#
#   Stage 1 (deps):    install production node_modules in a clean image
#                      so we don't drag devDependencies into the runtime.
#   Stage 2 (runtime): copy in the deps + app, drop to a non-root user,
#                      run under tini as PID 1, expose 3000, healthcheck
#                      via the /healthz endpoint using Node's built-in
#                      http module (no extra apt packages).
#
# Build:
#   docker build -t timetrackerapi .
#
# Run:
#   docker run --rm -p 3000:3000 \
#       -e DB_HOST=postgres -e DB_PASSWORD=... \
#       timetrackerapi

# ---- deps ----
FROM node:26-bookworm-slim AS deps

WORKDIR /app

# Copy only the manifest files first so a `npm ci` layer is cached when
# nothing else changed.
COPY package.json package-lock.json ./

# Production deps only; `npm ci --omit=dev` is faster + reproducible.
RUN npm ci --omit=dev && npm cache clean --force

# ---- web build ----
# Build the React SPA to static files. Kept in its own stage so the
# (dev) build toolchain never lands in the runtime image — only the
# built web/dist is copied across.
FROM node:26-bookworm-slim AS webbuild

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ---- runtime ----
FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    PORT=3000 \
    HOST=0.0.0.0

# tini gives us a proper PID 1 that reaps zombies and forwards signals
# cleanly to the Node process. Node *can* handle SIGTERM itself (see the
# graceful-shutdown handler in server.js) but as PID 1 the kernel
# doesn't deliver some default signals, so an explicit init is the
# safer pattern.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring in the prebuilt node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy in the rest of the app. Doing this AFTER node_modules means a
# small source change doesn't bust the deps layer.
COPY . .

# Bring in the built web UI from the webbuild stage. server.js serves
# web/dist (static + SPA fallback) when it's present, so the single
# container serves both the API and the app.
COPY --from=webbuild /web/dist ./web/dist

# Drop to the node user (uid 1000 in the official node images). Avoids
# running the server as root inside the container.
USER node

EXPOSE 3000

# OCI image labels — surface in registry UIs and `docker inspect`.
LABEL org.opencontainers.image.title="TimeTrackerAPI" \
      org.opencontainers.image.description="Open-source Node.js + PostgreSQL TimeTrackerAPI" \
      org.opencontainers.image.source="https://github.com/CryptoJones/TimeTrackerAPI" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Aaron K. Clark"

# HEALTHCHECK hits the in-app /healthz endpoint using Node's built-in
# http module — no extra apt package needed. Same probe an external
# orchestrator would use, so we exercise the full request pipeline
# rather than just checking the process exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/healthz',r=>{if(r.statusCode!==200)process.exit(1);let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{process.exit(JSON.parse(d).status==='ok'?0:1)}catch(e){process.exit(1)}})}).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
