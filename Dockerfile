# syntax=docker/dockerfile:1.6
###############################################################################
## 1️⃣  builder stage – install deps, compile TS → dist/                     ##
###############################################################################
ARG NODE_VERSION=22.12-alpine
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# ---------- package install (cached) -----------------------------------------
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# ---------- source copy + transpile ------------------------------------------
COPY tsconfig.json ./
COPY src  ./src
COPY mcp  ./mcp
RUN npm run build


###############################################################################
## 2️⃣  slim runtime stage – prod-only, TLS certs, non-root                  ##
###############################################################################
FROM node:22-alpine AS release

# Install TLS root certs so HTTPS works, and tini for signal handling
RUN apk add --no-cache ca-certificates tini \
 && update-ca-certificates

ENV NODE_ENV=production
WORKDIR /app

# ---------- copy compiled output & metadata ----------------------------------
COPY --from=builder /app/dist              ./dist
COPY --from=builder /app/mcp               ./mcp
COPY package.json package-lock.json        ./

# ---------- install *only* production deps (cached) --------------------------
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --prefer-offline --no-audit

# ---------- drop root privileges ---------------------------------------------
USER node

# ---------- runtime ----------------------------------------------------------
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
