# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bun-workspace monorepo with two apps:

- **`apps/api`** — NestJS app, originally a port of `../husrevity-api` (Spring Boot). **The NestJS API is now the source of truth / reference contract** — the web is synced to it. Spring is historical context only; cross-backend parity is **no longer maintained** (the web no longer needs to talk to the old Spring API).
- **`apps/web`** — Next.js 15 frontend, originally copied from `../husrevity-web`. Now synced to the NestJS contract (response field names, reorder body shape, Gmail DTOs, etc.). When web and API disagree, **the API wins** — fix the web.

`packages/` is reserved for cross-app TS types (`shared-types/`) but is currently empty.

> Phase 1 (auth, user, note, list, common, crypto) and Phase 2 (project, task, plan, calendar, reminder, vault, gmail) are **both shipped** as of commit `0f549d1`. All Spring modules now have NestJS counterparts.

## Commands (run from repo root)

```bash
bun install                 # workspaces install everything
bun run dev                 # api + web in parallel (concurrently, kill-others-on-fail)
bun run dev:api             # api only — http://localhost:4090/api  (swagger: /api/docs)
bun run dev:web             # web only — http://localhost:3090
bun run build               # build:api && build:web
bun run test                # api unit tests (jest, --passWithNoTests)
bun run test:e2e            # api e2e (jest with apps/api/test/jest-e2e.json)
bun run migration:run       # apply TypeORM migrations
bun run migration:generate  # generate new migration from entity diff
bun run db:backup           # manual pg_dump (scripts/pg-backup.sh)
```

API-only scripts (run from `apps/api/`):

```bash
bun run migration:revert    # rollback last migration
bun run migration:show      # list applied/pending migrations
```

Web lint (run from `apps/web/`):

```bash
bun run lint                # next lint (eslint v9 + eslint-config-next)
```

Run a single API jest test:

```bash
cd apps/api && bun run test -- path/to/foo.spec.ts
cd apps/api && bun run test -- -t "name of test"
```

Prerequisite: shared postgres on `:5432` from sibling repo

```bash
(cd "../shared-infra" && docker compose up -d)
```

Default seed login (created by migration `1715000001000-SeedAdmin`): **admin@admin.com** / **admin**.

## Stack

| Layer      | Spring (`../husrevity-api`)  | NestJS (`apps/api`)                       |
| ---------- | ---------------------------- | ----------------------------------------- |
| Framework  | Spring Boot 3.2.5            | NestJS 10                                 |
| Lang       | Java 17                      | TypeScript 5 (Bun runtime)                |
| DI         | Spring (component scan)      | NestJS (`@Module` declarative)            |
| ORM        | JPA / Hibernate              | TypeORM 0.3                               |
| Auth       | Spring Security + JWT filter | Passport-JWT + Guard                      |
| Validation | Bean Validation              | class-validator                           |
| Migrations | Flyway (`V{n}__*.sql`)       | TypeORM TS migrations                     |
| Docs       | springdoc-openapi            | `@nestjs/swagger`                         |
| Rate limit | Custom token bucket filter   | `@nestjs/throttler` (60s window, 100 req) |
| Crypto     | AES-GCM `CryptoUtil`         | AES-GCM `CryptoService`                   |

## API conventions (the API is the source of truth)

- Default port **4090**, global prefix `/api` (so endpoints are `/api/auth/login`, `/api/notes`, …). Set in `apps/api/src/main.ts`. Web runs on **3090**. (No default 3000/4000 anywhere — owner policy.)
- All non-auth endpoints require `Authorization: Bearer <jwt>` — `JwtAuthGuard` is registered as `APP_GUARD` in `app.module.ts`, so endpoints are **secure-by-default**. Mark public ones with `@Public()` (see `common/public.decorator.ts`).
- Public paths: `/api/auth/{register,login,refresh}`, `/api/health`, `/api/docs`.
- Response envelope `{ success, message, code, data }` — applied globally via `ResponseInterceptor`.
- Errors: throw `ApiException.badRequest/unauthorized/forbidden/notFound/conflict()` — never raw `Error` or NestJS HTTP exceptions. `GlobalExceptionFilter` maps them to the same envelope.
- Validation: global `ValidationPipe` with `whitelist: true, transform: true`. Validation failures are converted to `ApiException.badRequest()` so the envelope stays consistent.
- Soft-delete: every domain entity extends `BaseEntity` (id, createdAt, createdById, updatedAt, updatedById, deletedAt). Default queries exclude soft-deleted rows via TypeORM `@DeleteDateColumn`.
- Audit fields: `createdById`/`updatedById` populated by `AuditSubscriber` reading from a `RequestContext` AsyncLocalStorage (set by `JwtStrategy`). Don't set them manually.
- Multi-tenancy: every domain query filters by `ownerId` (current user). Service methods take `ownerId` as the first param.
- Reorder endpoints: `PATCH /resource/reorder` with body `{ items: [{ id, position }] }` (a `ReorderRequestDto` — **not** a bare array; `whitelist:true` rejects a bare array).
- Body parsing: a `text/plain` parser is registered globally (`main.ts`) for the Vault `.env` import endpoint. Don't remove it.
- Three global `APP_GUARD`s in `app.module.ts`, in this order: `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`. Use `@Roles('ROLE_ADMIN')` to gate by role.

## API directory layout (`apps/api/src/`)

Each feature module is self-contained: `<feature>.module.ts`, controller, service, entity, DTOs. Modules are explicitly listed in `app.module.ts` (no auto-scan).

- `common/` — `BaseEntity`, `ApiException`, `ResponseInterceptor`, `GlobalExceptionFilter`, `RolesGuard`, `AuditSubscriber`, `RequestContext`, `@Public()`, `@CurrentUser()`, `@Roles()`, `HealthController`.
- `auth/` — register/login/refresh/logout, JWT issuance, `RefreshToken` entity, `JwtStrategy`, `JwtAuthGuard`.
- `user/` — `User` + `Role`, `/me` endpoint.
- `note/`, `list/`, `project/`, `task/`, `plan/`, `calendar/`, `reminder/`, `vault/`, `gmail/` — domain modules (full CRUD, all gated by JWT + ownerId).
- `crypto/` — AES-GCM `CryptoService` (used by Vault).
- `config/typeorm.config.ts` — entity globs `**/*.entity.{ts,js}`, migration glob `db/migrations/*.{ts,js}`. `synchronize: false` always.
- `db/` — `data-source.ts`, `migrate.ts` CLI wrapper, `migrations/` (`Baseline`, `SeedAdmin`, `Phase2`, `RemoveDefaultAdmin` — prod-only, no-op in dev).

## Web app (`apps/web`)

Next.js 15 App Router + React 19 + Tailwind 4 + TanStack Query. Forked from `../husrevity-web` and **synced to the NestJS contract** (it no longer tracks upstream `husrevity-web` / Spring). `NEXT_PUBLIC_API_URL=http://localhost:4090/api` in dev.

- Route groups: `(landing)` (public), `(auth)` (login), `(app)` (protected — layout redirects unauthenticated users). Domain pages: `dashboard`, `notes`, `lists`, `projects`, `plans`, `calendar`, `reminders`, `gmail`, `vault`, `settings`.
- Provider stack (root `layout.tsx`): `I18nProvider` → `ReactQueryProvider` → `AuthProvider` → `ThemeProvider` → `SidebarProvider`.
- Auth: `AuthProvider` stores JWT in `localStorage`; `services/api-client.ts` is the axios instance that injects the Bearer token and auto-refreshes on 401/403 (skipping `/auth/*` to avoid loops). `auth-events.ts` is the pub/sub bridge for forced logout.
- Data fetching: feature hooks in `src/hooks/` (e.g. `useNotes`, `useLists`, `useProjects`) wrap TanStack Query and call services in `src/services/`. Each hook file exports the full CRUD set (`useX`, `useCreateX`, `useUpdateX`, `useDeleteX`). Follow this pattern for new domains.
- Backend response shape it expects: `{ success, message, code, data }` — same envelope the API emits.
- Path alias: `@/` → `src/`. SVGs are React components via `@svgr/webpack` (`next.config.ts`).
- i18n: `react-i18next` + `i18next-http-backend` + browser language detector; `<html lang>` is set dynamically.

> `apps/web/CLAUDE.md` is left over from the original `husrevity-web` fork — it still references `npm` and port `8080` and a non-existent `useVehicles` example. Trust **this** root file over that one.

## Environment files

- Root `.env.example` — only shared DB vars (rarely needed; per-app `.env`s are the source of truth).
- `apps/api/.env` (gitignored, copy from `.env.example`) — Postgres, JWT secret/TTLs, AES-GCM key, CORS origins, optional Google OAuth for Gmail.
- `apps/web/.env.local` (gitignored, copy from `.env.example`) — just `NEXT_PUBLIC_API_URL`.

JWT defaults: 15-min access tokens, 30-day opaque refresh tokens (SHA-256 hashed at rest).

## Backup

`scripts/pg-backup.sh` (`pg_dump -Fc` of `husrevity_nest` from the `shared-postgres` container) → `/Users/husrev/Backup/husrevity-db-dumps/`. 14-day retention. Auto-synced to Google Drive Desktop. Daily at 03:00 via LaunchAgent (`ops/com.husrev.husrevitybackup.plist`). Manual: `bun run db:backup`.

## Workflow tips

- New API feature → create `apps/api/src/<feature>/` with `<feature>.module.ts`, controller, service, entity, DTOs. Register the module in `app.module.ts`. Don't forget `TypeOrmModule.forFeature([Entity])` inside the feature module — missing this is the most common "repository not found" cause.
- New entity column → generate a migration: `cd apps/api && bun run migration:generate src/db/migrations/AddXToY`. **Never** turn on `synchronize: true`, even in dev.
- New web domain → mirror an existing one: add `services/<domain>-service.ts`, `hooks/use<Domain>.ts` (full CRUD set), and a route under `app/(app)/<domain>/`.

## Commit messages

The owner commits/pushes themselves (per global HARD CONSTRAINT #0). Prepared
commit messages and PR bodies describe the work only — no AI attribution. No
`Co-Authored-By: Claude …`, no `🤖 Generated with [Claude Code]`, no mention
of Claude / Anthropic / AI / "asistan". Use neutral imperative voice
("adds X", "fixes Y") — see global HARD CONSTRAINT #1 for the full rule.
