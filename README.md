# husrevity

Personal productivity monorepo — **NestJS** API + **Next.js** web, Bun workspaces. One `bun run dev` boots both.

`apps/api` began as a **port of [`husrevity-api`](../husrevity-api)** (Spring Boot) into NestJS. The **NestJS API is now the source of truth** and `apps/web` is synced to its contract; Spring is historical context only and cross-backend parity is no longer maintained.

> Status: **Phase 1 + Phase 2 shipped + cross-cutting Notifications + Evkat module.** All Spring modules (auth, user, note, list, project, task, plan, calendar, reminder, vault, gmail, crypto) have NestJS counterparts; on top of that a central `notification` module (web-push via VAPID + per-minute cron + bell dropdown) wires every scheduled entity into one queue, and the new `time-block` module backs the **Evkat** daily hour-stack planner at `/evkat`.

> Deployment, hosting, secrets, and operational concerns live in the separate infra repo at `~/iamhusrev-prod/`. This README covers local development only.

## Stack

| Layer             | Tooling                                                     |
| ----------------- | ----------------------------------------------------------- |
| Runtime / pkg mgr | Bun 1.3+ (workspaces)                                       |
| API               | NestJS 10 + TypeORM 0.3                                     |
| Web               | Next.js 15 + React 19 + Tailwind 4 + TanStack Query         |
| DB                | Postgres 16 (shared-infra container `:5432`)                |
| Auth              | JWT 15-min access + opaque 30-day refresh (SHA-256 at rest) |
| Push              | Web Push (VAPID) + `/sw.js`; `@nestjs/schedule` cron        |
| Orchestration     | `concurrently`                                              |

---

## Dev — local setup

Prereq: shared Postgres from the sibling repo must be up.

```bash
# 0. Shared postgres (one-time, from sibling repo)
(cd "../shared-infra" && docker compose up -d)

# 1. Install everything (workspaces)
bun install

# 2. Per-app env files (both gitignored)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Baseline migration + seed admin
bun run migration:run

# 4. Boot api + web in parallel
bun run dev
#   api → http://localhost:4090/api   (swagger: /api/docs)
#   web → http://localhost:3090
```

Default seed login: **admin@admin.com / admin** (created by migration `1715000001000-SeedAdmin`).

Generate the secrets in `apps/api/.env` before first run:

```bash
openssl rand -base64 48   # → HUSREVITY_JWT_SECRET (>= 32 bytes)
openssl rand -base64 32   # → HUSREVITY_CRYPTO_KEY  (32 bytes, AES-GCM)

# Web Push (VAPID) — required for OS-level notifications. The in-app bell
# still works without it, but the dispatcher cron just logs a warning.
cd apps/api && bunx web-push generate-vapid-keys
#   → set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in apps/api/.env
#   → VAPID_SUBJECT=mailto:<your-email>
```

### Common commands (from repo root)

```bash
bun run dev                 # api + web (kill-others-on-fail)
bun run dev:api             # api only
bun run dev:web             # web only
bun run build               # build:api && build:web
bun run test                # api unit tests (jest)
bun run test:e2e            # api e2e (smoke)
bun run migration:run       # apply TypeORM migrations
bun run migration:generate  # generate migration from entity diff
```

API-only (from `apps/api/`): `bun run migration:revert`, `bun run migration:show`.
Web lint (from `apps/web/`): `bun run lint`.

---

## Layout

```
husrevity/
├── apps/
│   ├── api/                        # NestJS port (self-contained feature modules)
│   │   ├── src/<feature>/          # module + controller + service + entity + dto
│   │   │                           # auth, user, note, list, project, task, plan,
│   │   │                           # calendar, reminder, vault, gmail, ai, crypto,
│   │   │                           # notification (cron + web-push), time-block (Evkat)
│   │   ├── src/db/migrations/      # TypeORM migrations (Baseline … NotificationsAndTimeBlock)
│   │   └── scripts/hash-password.ts
│   └── web/                        # Next.js (forked from husrevity-web)
│       ├── public/sw.js            # minimal Web Push service worker
│       └── src/app/(app)/evkat/    # Evkat daily hour-stack page (/evkat)
├── packages/                       # reserved for shared-types (empty)
└── docs/
    └── PROJECT-STRUCTURE.md        # end-to-end architecture walkthrough (start here)
```

See [`docs/PROJECT-STRUCTURE.md`](./docs/PROJECT-STRUCTURE.md) for the end-to-end architecture walkthrough (request lifecycle, module-by-module catalogue, frontend mirror). [`CLAUDE.md`](./CLAUDE.md) is the short-form conventions reference (response envelope, soft-delete, audit, multi-tenancy).
