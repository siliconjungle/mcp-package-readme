# syntax=docker/dockerfile:1

###############################################################################
# 1. builder stage – install deps, compile TS → dist/                         #
###############################################################################
FROM node:22.12-alpine AS builder

WORKDIR /app

# copy lock info first so the big npm layer is nicely cached
COPY package.json package-lock.json ./

# install ALL deps (prod + dev) once, cached
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# copy the rest of the sources only when they change
COPY tsconfig.json ./
COPY src  ./src
COPY mcp  ./mcp

# compile Typescript -> ./dist
RUN npm run build

###############################################################################
# 2. release stage – slim runtime with prod-only deps                         #
###############################################################################
FROM node:22-alpine AS release

WORKDIR /app
ENV NODE_ENV=production

# bring in compiled code and lock files
COPY --from=builder /app/dist              ./dist
COPY --from=builder /app/mcp               ./mcp
COPY package.json package-lock.json        ./

# reuse node_modules from builder, then prune devDependencies
COPY --from=builder /app/node_modules      ./node_modules
RUN npm prune --omit=dev --ignore-scripts   # quick, no network

# server listens on stdio, but expose a port in case you swap transports
EXPOSE 8080
ENTRYPOINT ["node", "dist/index.js"]
