# husrevity

[![Deploy](https://github.com/iamhusrev/husrevity/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/iamhusrev/husrevity/actions/workflows/deploy.yml)

Self-hosted personal productivity platform — **NestJS** API + **Next.js** web, Bun workspaces. One `bun run dev` boots both. It's a single-owner-plus-collaborators system (notes, tasks, projects, calendar, reminders, an encrypted-at-rest secrets vault) that has been in the author's own daily use since 2024.

`apps/api` was originally implemented as a Spring Boot service and was later fully ported to NestJS; the **NestJS API is now the source of truth** and `apps/web` is synced to its contract, with no ongoing Spring Boot version maintained.

> Status: **Phase 1 + Phase 2 shipped + cross-cutting Notifications + Evkat module.** All original modules (auth, user, note, list, project, task, plan, calendar, reminder, vault, gmail, crypto) have NestJS implementations; on top of that a central `notification` module (web-push via VAPID + per-minute cron + bell dropdown) wires every scheduled entity into one queue, and the new `time-block` module backs the **Evkat** daily hour-stack planner at `/evkat`.

> Deployment, hosting, and secrets management live in a separate private infrastructure repository. This README covers local development, architecture, and the deployment mechanism only — not the infra repo's contents.

## Why it exists

Most task/note/calendar apps force a choice between several single-purpose SaaS tools or one bloated all-in-one platform with someone else's data-retention policy. husrevity consolidates notes, tasks, projects, a calendar, reminders, and a secrets vault into one API and one UI that the author fully owns and operates, with project-level collaboration (owner/editor/viewer roles) layered on top of what started as a single-user tool.

## Stack

| Layer             | Tooling                                                     |
| ----------------- | ----------------------------------------------------------- |
| Runtime / pkg mgr | Bun 1.3+ (workspaces)                                       |
| API               | NestJS 10 + TypeORM 0.3                                     |
| Web               | Next.js 15 + React 19 + Tailwind 4 + TanStack Query         |
| DB                | Postgres 16 (external instance, port `5432`)                |
| Auth              | JWT 15-min access + opaque 30-day refresh (SHA-256 at rest) |
| Push              | Web Push (VAPID) + `/sw.js`; `@nestjs/schedule` cron        |
| Orchestration     | `concurrently`                                              |

---

## Dev — local setup

Prereq: a Postgres instance must be reachable (any local Postgres 16 works; the author runs a shared instance managed in a separate infrastructure repo).

```bash
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

---

## Architecture

- **Bun workspaces.** `apps/api` and `apps/web` are separate `package.json`s under one `workspaces: ["apps/*", "packages/*"]` root. This gets a single `bun install` and a single lockfile across both apps, one shared TypeScript/Prettier config, and a `packages/` slot reserved for cross-app types (`shared-types/`) once the API and web DTOs need to share a definition instead of being kept in sync by hand.
- **Isolation model.** Every domain query is scoped at the application layer, not via database-level row security: service methods take the current user's id as an explicit first parameter and filter on it (e.g. `WHERE owner_id = :ownerId`), enforced consistently by convention across every feature module. The one exception is `project`/`task`, where multi-user collaboration is needed — those two modules gate access through a dedicated `ProjectAccessService.requireAccess(userId, projectId, minRole)` check against `project_member` rows (`OWNER` / `EDITOR` / `VIEWER`) instead of a plain owner filter. A personal task with no project attached stays strictly owner-scoped.
- **Vault encryption.** The `vault` module stores arbitrary secrets (credentials, notes, imported `.env` files) encrypted at rest with AES-256-GCM (`crypto/crypto.service.ts`): a random 12-byte IV per value, ciphertext, and a 16-byte auth tag are concatenated and stored base64-encoded, keyed by a single server-side 32-byte key (`HUSREVITY_CRYPTO_KEY`, never stored in the database). The key is intentionally treated as immutable in production — rotating it makes existing vault entries permanently undecryptable.

## Deployment

The `master` branch auto-deploys via a self-hosted GitHub Actions runner (`.github/workflows/deploy.yml`): every push builds the `docker-compose.yml` stack (`api` + `web`, both bound to loopback only, fronted by a tunnel that terminates TLS at the edge) and restarts it in place, then runs a health check and a public smoke test before finishing. Secrets never pass through GitHub Actions secrets or the repo itself — the workflow points a gitignored env-file symlink at a single file that already lives on the deploy host, and both the API container's `env_file` and Compose's own `${VAR}` interpolation read from that one file. Anyone self-hosting this needs to provide their own equivalent secrets file and adjust the workflow's path to it.

## License

MIT — see [LICENSE](./LICENSE).
