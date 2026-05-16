# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Aaron K. Clark
#
# Multi-stage Dockerfile for TimeTrackerAPI.
#
#   Stage 1 (deps):    install production node_modules in a clean image
#                      so we don't drag devDependencies into the runtime.
#   Stage 2 (runtime): copy in the deps + app, drop to a non-root user,
#                      expose 3000, healthcheck via the /healthz endpoint.
#
# Build:
#   docker build -t timetrackerapi .
#
# Run:
#   docker run --rm -p 3000:3000 \
#       -e DB_HOST=postgres -e DB_PASSWORD=... \
#       timetrackerapi

# ---- deps ----
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Copy only the manifest files first so a `npm ci` layer is cached when
# nothing else changed.
COPY package.json package-lock.json ./

# Production deps only; `npm ci --omit=dev` is faster + reproducible.
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    PORT=3000 \
    HOST=0.0.0.0

# wget is used by the HEALTHCHECK; it's tiny and avoids pulling curl.
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring in the prebuilt node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy in the rest of the app. Doing this AFTER node_modules means a
# small source change doesn't bust the deps layer.
COPY . .

# Drop to the node user (uid 1000 in the official node images). Avoids
# running the server as root inside the container.
USER node

EXPOSE 3000

# HEALTHCHECK hits the in-app /healthz endpoint — same probe an
# external orchestrator would use, so we exercise the full request
# pipeline rather than just checking the process exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O- http://localhost:${PORT:-3000}/healthz | grep -q '"status":"ok"' || exit 1

CMD ["node", "server.js"]
