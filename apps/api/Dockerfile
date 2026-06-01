# Build context expected: monorepo root.
# Build: `docker compose build api`

# ---- Builder ----
FROM oven/bun:1.3 AS builder
WORKDIR /repo

# Workspace manifests first for cached install layer
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --frozen-lockfile

# Source + build
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
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY apps/api/scripts ./apps/api/scripts
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 4090

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "dist/main.js"]
