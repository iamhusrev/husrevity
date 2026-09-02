# AGENTS.md

Guidance for AI coding agents (codex, agy) working in this repository. Derived from the
project's `CLAUDE.md` — read that file too if present; this is a condensed, agent-facing
version of the same conventions.

## What this is

Bun-workspace monorepo with two apps:

- **`apps/api`** — NestJS app. The NestJS API is the source of truth / reference contract.
- **`apps/web`** — Next.js 15 frontend, synced to the NestJS contract. When web and API
  disagree, the API wins — fix the web.

`packages/` is reserved for cross-app TS types but is currently empty.

## Commands (run from repo root)

```bash
bun install
bun run dev                 # api + web in parallel
bun run dev:api             # api only — http://localhost:4090/api (swagger: /api/docs)
bun run dev:web             # web only — http://localhost:3090
bun run build               # build:api && build:web
bun run test                # api unit tests (jest)
bun run test:e2e            # api e2e
bun run migration:run
bun run migration:generate
```

Web lint (from `apps/web/`): `bun run lint`. Single API test: `cd apps/api && bun run test -- path/to/foo.spec.ts`.

Prerequisite: shared postgres on `:5432` from sibling repo `../shared-infra` (`docker compose up -d`).

## Stack

| Layer | apps/api | apps/web |
|---|---|---|
| Framework | NestJS 10 | Next.js 15 App Router |
| Lang | TypeScript 5 (Bun runtime) | TypeScript 5 (strict) |
| ORM | TypeORM 0.3 | — |
| Auth | Passport-JWT + Guard | axios interceptor + JWT in localStorage |
| Validation | class-validator | react-hook-form + zod |
| Migrations | TypeORM TS migrations, hand-written raw SQL | — |
| Docs | `@nestjs/swagger` | — |
| Data fetching | — | TanStack Query v5 |
| Styling | — | Tailwind CSS 4 (`@theme` in `globals.css`) |

## API conventions

- Default port **4090**, global prefix `/api`. Web runs on **3090**. Never default to 3000/4000.
- All non-auth endpoints require `Authorization: Bearer <jwt>` — `JwtAuthGuard` is `APP_GUARD`, secure-by-default. Mark public routes with `@Public()`.
- Response envelope `{ success, message, code, data }` — applied globally via `ResponseInterceptor`.
- Errors: throw `ApiException.badRequest/unauthorized/forbidden/notFound/conflict()` — never raw `Error` or NestJS HTTP exceptions.
- Validation: global `ValidationPipe` with `whitelist: true, transform: true`.
- Soft-delete: every domain entity extends `BaseEntity` (id, createdAt, createdById, updatedAt, updatedById, deletedAt). TypeORM `@DeleteDateColumn`.
- Multi-tenancy: domain queries filter by `ownerId` (current user), except `project`/`task` which use `ProjectAccessService.requireAccess()` for shared-project access.
- Reorder endpoints: `PATCH /resource/reorder` body `{ items: [{ id, position }] }` (a DTO, never a bare array).
- Migrations are **hand-written raw SQL** classes (`MigrationInterface`, `up`/`down` via `qr.query(...)`), timestamp-prefixed, in `apps/api/src/db/migrations/`. **Never edit an already-applied migration** — add a new one. `synchronize: false` always; entity discovery is a `**/*.entity.{ts,js}` glob, no manual registration needed.

## API directory layout (`apps/api/src/`)

Each feature module is self-contained: `<feature>.module.ts`, controller, service, entity, DTOs. Modules are explicitly listed in `app.module.ts` (no auto-scan). `common/` holds shared primitives (`BaseEntity`, `ApiException`, guards, decorators). `db/` holds `data-source.ts`, `migrate.ts`, `migrations/`.

## Web app (`apps/web`)

Next.js 15 App Router + React 19 + Tailwind 4 + TanStack Query. `NEXT_PUBLIC_API_URL=http://localhost:4090/api` in dev.

- Route groups: `(landing)` (public), `(auth)` (login etc.), `(app)` (protected — layout redirects unauthenticated users).
- Navigation lives in `src/layout/` (`AppSidebar.tsx`, `AppHeader.tsx`, `MobileBottomNav.tsx`).
- Provider stack (root `layout.tsx`): `I18nProvider` → `ReactQueryProvider` → `AuthProvider` → `ThemeProvider` → `SidebarProvider`.
- Auth: `AuthProvider` stores JWT in `localStorage`; `services/api-client.ts` is the axios instance injecting the Bearer token and auto-refreshing on 401/403.
- Data fetching: feature hooks in `src/hooks/` (e.g. `useNotes`) wrap TanStack Query and call services in `src/services/`. Each hook file exports the full CRUD set. Follow this pattern for new domains.
- Backend response shape it expects: `{ success, message, code, data }`.
- Path alias: `@/` → `src/`. SVGs are React components via `@svgr/webpack`.
- i18n: `react-i18next`, two static locale files `src/messages/{en,tr}.json`, single flat `common` namespace (no HTTP backend despite what any stale doc may say). `en.json` and `tr.json` must stay key-for-key identical — edit both, by key not by line number.
- Design system: `apps/web/src/app/globals.css` — Tailwind 4 `@theme` block defining a warm "husrev" brand ramp (`brand-500` ember `#a14d18`, `brand-400` amber `#c8732e`), fonts Outfit (sans) / Instrument Serif (serif) / JetBrains Mono, and app-specific utility classes `.husrev-{rule,kicker,input,btn,btn-ghost,lift,pill,shimmer,stagger,modal}`. Reuse these — do not invent a parallel palette or component system.

## Environment files

- `apps/api/.env` (gitignored) — Postgres, JWT secret/TTLs, AES-GCM key, CORS origins, optional Gemini key.
- `apps/web/.env.local` (gitignored) — `NEXT_PUBLIC_API_URL`.

## Workflow tips

- New API feature → `apps/api/src/<feature>/` with module/controller/service/entity/DTOs, registered in `app.module.ts`. Don't forget `TypeOrmModule.forFeature([Entity])`.
- New entity column → generate a migration, never turn on `synchronize: true`.
- New web domain → mirror an existing one: `services/<domain>-service.ts`, `hooks/use<Domain>.ts`, route under `app/(app)/<domain>/`.

## Git / commits

**Never run `git add`, `git commit`, `git push`, or any other git write operation.** The
repo owner commits and pushes manually. When a task is complete, stop, report what changed,
and (if asked) propose a commit message — do not create the commit yourself.

## Code comments

Always in English, regardless of what language the task was described in.
