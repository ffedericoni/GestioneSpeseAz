# ── build ─────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json  ./packages/shared/
COPY packages/server/package.json  ./packages/server/
COPY packages/web/package.json     ./packages/web/

# npm runs `prepare` for workspace packages even with --ignore-scripts.
# Remove it here so npm ci doesn't try to run tsc before source is copied.
RUN node -e " \
  const fs = require('fs'); \
  const path = 'packages/shared/package.json'; \
  const p = JSON.parse(fs.readFileSync(path, 'utf8')); \
  delete p.scripts.prepare; \
  fs.writeFileSync(path, JSON.stringify(p, null, 2) + '\n'); \
"

RUN npm ci

# Copy source after install to preserve the npm ci cache layer
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/
COPY packages/web/    ./packages/web/

# Build in dependency order: shared → prisma generate → web → server
RUN npm run build --workspace packages/shared
RUN node_modules/.bin/prisma generate --schema=packages/server/prisma/schema.prisma
RUN npm run build --workspace packages/web
RUN npm run build --workspace packages/server

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY packages/shared/package.json  ./packages/shared/
COPY packages/server/package.json  ./packages/server/
COPY packages/web/package.json     ./packages/web/

# Same prepare-script removal needed here before npm ci --omit=dev
RUN node -e " \
  const fs = require('fs'); \
  const path = 'packages/shared/package.json'; \
  const p = JSON.parse(fs.readFileSync(path, 'utf8')); \
  delete p.scripts.prepare; \
  fs.writeFileSync(path, JSON.stringify(p, null, 2) + '\n'); \
"

RUN npm ci --omit=dev

# Built artefacts from the builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/web/dist    ./packages/web/dist

# sodium-native (used by @fastify/secure-session) ships a musl binary that its
# postinstall may not download reliably in Alpine; copy the working one from builder.
COPY --from=builder /app/node_modules/sodium-native ./node_modules/sodium-native

# Prisma: schema + migrations (for migrate deploy) + generated client
COPY packages/server/prisma ./packages/server/prisma
COPY --from=builder /app/node_modules/.prisma     ./node_modules/.prisma
# Prisma CLI is a devDep so not installed above; copy binary from builder
COPY --from=builder /app/node_modules/prisma      ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
