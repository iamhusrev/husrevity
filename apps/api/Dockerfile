# Build context expected: monorepo root.
# Build: `docker compose build api`

# ---- Builder ----
FROM oven/bun:1.3 AS builder
WORKDIR /repo

# Workspace manifests first for cached install layer
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
# Every workspace manifest must be present or `--frozen-lockfile` fails (the
# lockfile covers the whole monorepo). --filter then installs only what the
# API needs, so the mobile app's dependency tree stays out of this image.
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/parser/package.json ./packages/parser/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json

RUN bun install --frozen-lockfile --filter '@husrevity/api'

# Source + build. @husrevity/parser is a workspace package published as
# compiled CommonJS (dist/) — `.dockerignore` drops host dist folders, so it
# is built here (apps/api's `prebuild` also builds it).
COPY packages/parser ./packages/parser
COPY apps/api ./apps/api
RUN cd apps/api && bun run build

# NOTE: We deliberately do NOT `bun install --production` here. With Bun
# workspaces that flag flattens node_modules in a way that drops runtime deps
# (notably reflect-metadata required by TypeORM's data-source).

# ---- Runner ----
FROM oven/bun:1.3-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Bun workspaces split deps across /repo/node_modules (hoisted) and
# /repo/apps/api/node_modules (sub-workspace). Both are required at runtime;
# missing either yields "Cannot find package 'reflect-metadata'".
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
# apps/api/node_modules/@husrevity/parser is a symlink to ../../../../packages/parser
COPY --from=builder /repo/packages/parser/package.json ./packages/parser/package.json
COPY --from=builder /repo/packages/parser/dist ./packages/parser/dist
# parser's own deps (luxon) are symlinks into the hoisted /app/node_modules/.bun store
COPY --from=builder /repo/packages/parser/node_modules ./packages/parser/node_modules
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY apps/api/scripts ./apps/api/scripts
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 4090

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "dist/main.js"]
