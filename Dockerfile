# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
# Builds the TanStack Start app with Nitro's "node-server" preset so the
# output is a plain Node.js server (no Cloudflare Workers runtime needed).
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Install deps first (better layer caching).
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy the rest of the source.
COPY . .

# Tell Nitro to emit a Node server instead of the default Cloudflare target.
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production

RUN bun run build

# ---------- Stage 2: runtime ----------
# Small Node image that just runs the prebuilt server from .output/.
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV RUNTIME_CONFIG_PATH=/app/config.json

# Copy the standalone Nitro output. It already includes its own node_modules.
COPY --from=builder /app/.output ./.output
# Runtime tenant config is read from /app/config.json by default.
# Docker Compose and Kubernetes should mount their config file there.

EXPOSE 3000

# Healthcheck hits the root route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", ".output/server/index.mjs"]
