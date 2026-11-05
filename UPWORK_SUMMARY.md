# husrevity: Upwork portfolio summary

## 1. One-line pitch

A self-hosted productivity system that an AI assistant can safely operate through 105 MCP tools.

## 2. What it does

husrevity is a personal productivity platform for one person or a small group. It holds tasks, projects, notes, reminders, calendar events, goals, learning topics, workout logs and a daily time-block planner, and it is available as a web app and an early mobile app. Its main feature is that an AI assistant (Claude, through the Model Context Protocol) can work on the same data: capture ideas, plan the week, create and complete tasks. Every change the assistant makes is recorded and can be undone, so the user stays in control of their data. It also syncs with Google Calendar and sends reminders by web push, email, Telegram, Slack and mobile push.

## 3. Tech stack

- **Language:** TypeScript throughout (`typescript ^5.7.2`).
- **Monorepo:** Bun workspaces (`engines.bun >= 1.3.0` in `package.json`): `apps/api`, `apps/web`, `apps/mobile`, `packages/parser`, `packages/api-client`.
- **API** (`apps/api/package.json`): NestJS `^10.4.15` (`@nestjs/core`, `@nestjs/jwt ^10.2.0`, `@nestjs/passport ^10.0.3`, `@nestjs/schedule ^4.1.2`, `@nestjs/swagger ^8.1.0`, `@nestjs/throttler ^6.4.0`), TypeORM `^0.3.20`, `pg ^8.13.1`, zod `^4.1.12` (pinned to `4.1.12` through root `overrides`), bcrypt `^5.1.1`, web-push `^3.6.7`, googleapis `^182.0.0`.
- **Database:** PostgreSQL 16 (README), with TypeORM migrations under `apps/api/src/db/migrations`.
- **Job queue:** pg-boss `^12.35.0` (Postgres-backed jobs), plus `@nestjs/schedule` cron jobs.
- **AI / agent:** `@modelcontextprotocol/sdk ^1.30.1`; Google Gemini REST API (default model `gemini-2.5-flash`, `apps/api/src/ai/gemini.config.ts`).
- **Web** (`apps/web/package.json`): Next.js `^15.4.3`, React `^19.0.0`, Tailwind CSS `^4.0.0`, TanStack Query `^5.90.12`, react-hook-form `^7.66.1`, i18next `^25.6.2` / react-i18next `^16.3.3`, FullCalendar `^6.1.15`, react-dnd `^16.0.1`.
- **Mobile** (`apps/mobile/package.json`): Expo `~52.0.37`, React Native `0.76.7`, React `18.3.1`, expo-router `~4.0.17`, expo-notifications, expo-secure-store.
- **Tests:** Jest `^29.7.0` + ts-jest (API), Vitest `^5.0.0` + Testing Library (web).
- **Infra / deploy:** multi-stage Dockerfile on `oven/bun:1.3` (`apps/api/Dockerfile`), separate web Dockerfile (`apps/web/dockerfile`), `docker-compose.yml` with `api` + `web` services bound to loopback only, Cloudflare Tunnel in front (README). GitHub Actions on a self-hosted runner: `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`.

## 4. Engineering highlights

- **Undoable agent writes (change sets).** Every MCP write is recorded as a change set. Undo runs in a transaction, loads the change set with a `pessimistic_write` lock and returns a per-record conflict list instead of overwriting records the user edited afterwards. `apps/api/src/change-set/change-set.service.ts` (spec: `change-set.service.spec.ts`).
- **Least-privilege agent auth.** Personal access tokens are checked by `apps/api/src/mcp/pat-auth.guard.ts`. Scopes are enforced per tool, not per route, through `getOwnerAndCheckScope` / `getOwnerAndCheckAnyScope` in `apps/api/src/mcp/tools/mcp-tool-helpers.ts`. Web auth uses refresh tokens stored only as hashes with rotation (`apps/api/src/auth/refresh-token.entity.ts`, `apps/api/src/auth/auth.service.ts`).
- **Idempotent writes for offline clients.** An opt-in `Idempotency-Key` header replays the stored response when a mobile offline queue retries a POST/PATCH after a dropped response. `apps/api/src/common/idempotency.interceptor.ts`, `apps/api/src/common/idempotency-key.entity.ts`. The mobile app uses delta sync through `apps/api/src/sync/sync.service.ts`.
- **Google Calendar two-way sync.** Incremental sync tokens with a full resync fallback on HTTP 410, verified push webhooks, watch-channel renewal and a pg-boss polling backstop. `apps/api/src/integrations/google-calendar-sync.service.ts`, `gcal-webhook.controller.ts`, `gcal-watch-renewal.service.ts`, `google-calendar-sync-job.service.ts`.
- **Audit trail, soft delete and encryption.** A shared base entity with soft delete and a trash/restore flow (`apps/api/src/common/base.entity.ts`, `apps/api/src/trash/`), an audit subscriber fed by an `AsyncLocalStorage` request context (`apps/api/src/common/audit.subscriber.ts`, `request-context.ts`), and AES-256-GCM encryption for vault values and stored OAuth tokens (`apps/api/src/crypto/crypto.service.ts`).
- **Test setup and CI/CD.** 220 spec/test files, including a module-graph check (`apps/api/src/module-graph.spec.ts`), entity relation checks (`apps/api/src/db/entity-relation-types.spec.ts`) and migration tests (`apps/api/src/db/migrations/__tests__`). CI runs frozen-lockfile install, API and web builds, web lint and API tests on every push and PR (`.github/workflows/ci.yml`). Pushes to master build and restart the Compose stack, wait for the API health check and smoke-test the public health URL (`.github/workflows/deploy.yml`). Migrations run when the API container starts (`apps/api/docker-entrypoint.sh`).

## 5. AI / agent parts

- **MCP server:** served from `POST /api/mcp` (`apps/api/src/mcp/mcp.controller.ts`), built per request in `apps/api/src/mcp/mcp-server-factory.ts` with `@modelcontextprotocol/sdk`.
- **Tool count: 105**, counted as `server.registerTool(` calls in non-spec files under `apps/api/src/mcp/tools/`:
  reminders 14, sport 14, items 13, learning 10, goals 7, notes 7, routines 7, tasks 7, calendar 6, projects 6, notifications 5, time blocks 5, and 1 call each in `capture-tool.ts`, `life-context-tool.ts`, `plan-tool.ts` and `trash-tools.ts`. Higher-level intent tools include `capture`, `quick_add`, `plan_week`, `apply_plan`, `get_life_context`, `list_change_sets` and `undo_change_set`.
- **MCP prompts:** 4 planning prompts registered with `registerPrompt` in `apps/api/src/mcp/tools/planning-prompts.ts`.
- **How writes are guarded:**
  - Per-tool scope checks on personal access tokens (`mcp-tool-helpers.ts`, `pat-auth.guard.ts`, scope definitions in `apps/api/src/auth/personal-access-token.entity.ts`).
  - Change sets with transactional undo and conflict detection (`apps/api/src/change-set/`).
  - A secret guard that rejects credential-like text (passwords, API keys, JWTs, PEM blocks, known token prefixes) in tool input (`apps/api/src/mcp/tools/secret-guard.ts`).
  - Name lookups that fail with a candidate list instead of guessing when a match is ambiguous (`resolveByIdOrName` in `mcp-tool-helpers.ts`).
  - Trash listing returns titles only and hides kinds the token cannot read (`apps/api/src/mcp/tools/trash-tools.ts`).
  - Safety specs: `apps/api/src/mcp/tools/mcp-tools-safety.spec.ts`, `mcp-server-factory.spec.ts`, plus one spec per tool file.
- **LLM provider:** Google Gemini REST API, used for "today's suggestions" (`apps/api/src/ai/ai-suggestion.service.ts`, `suggestion-parser.ts`) and for parsing dictated speech into structured items (`apps/api/src/ai/dictate.service.ts`, `dictate-parser.ts`). There is no tool-calling loop inside the app itself: the agent loop runs in the external MCP client.
- **Natural-language quick add:** a rule-based Turkish quick-add parser package (`packages/parser/src`), not an LLM.

## 6. Scale signals

How counted: from the repo root, `git ls-files`, excluding `bun.lock`, `yarn.lock`, `package-lock.json`, `dist/`, `.next/` and `node_modules`, then `cat` piped to `wc -l` per extension. Counts include blank lines and comments. Code counts used `grep` over tracked files.

| Language / type | Files | Lines |
| --- | ---: | ---: |
| TypeScript (`.ts`) | 580 | 66,790 |
| TSX (`.tsx`) | 217 | 37,704 |
| JSON | 20 | 4,160 |
| Markdown | 13 | 2,633 |
| CSS | 1 | 1,153 |
| YAML (`.yml`) | 3 | 204 |
| JS / MJS | 4 | 272 |
| Shell | 2 | 112 |

- TS/TSX split: about 63,700 lines of non-test code and about 40,800 lines of test code.
- By app (TS + TSX): `apps/api` 54,171, `apps/web` 47,022, `apps/mobile` 2,807, `packages` 494.
- **API modules:** 34 `*.module.ts` files under `apps/api/src` (33 top-level feature folders).
- **Controllers / endpoints:** 40 files containing `@Controller(`; 186 `@Get/@Post/@Put/@Patch/@Delete` handlers in `*.controller.ts` files. Swagger docs are generated by `@nestjs/swagger`.
- **Entities / migrations:** 41 `*.entity.ts` files; 41 migration files in `apps/api/src/db/migrations` (plus a `__tests__` folder).
- **Tests:** 220 `*.spec.ts(x)` / `*.test.ts(x)` files (API 121, web 92, mobile 6, parser 1). Lines starting with `it(` / `test(`: 1,216 in the API and 812 elsewhere, so about 2,000 test cases.
- **MCP:** 105 tools, 4 prompts.
- **History:** 83 commits, 2026-05-24 to 2026-10-24 (`git log`). The README says the system started earlier as a Spring Boot service and was later ported to NestJS.

## 7. Three portfolio-image ideas

1. **Agent architecture diagram:** Claude (MCP client) → personal access token → `/api/mcp` → per-tool scope check → secret guard → domain services → Postgres, with a side lane showing each write landing in a change set and an "undo" arrow returning a conflict list.
2. **Undo flow screen or sequence:** a three-step strip: the agent runs `plan_week` / `apply_plan` and creates time blocks, the user edits one block, `undo_change_set` reverts the rest and reports the edited block as a conflict.
3. **Deployment pipeline diagram:** push → GitHub Actions CI (install, build API + web, lint, tests) → deploy job on a self-hosted runner → Docker Compose (api + web on loopback) → health check → Cloudflare Tunnel, with "no inbound ports" called out. Pair it with a screenshot of the web dashboard or week planner using demo data only.

## 8. Risks / things not to claim

- **Single-owner system, not a multi-tenant SaaS.** Data is isolated per user in application code, and projects have OWNER/EDITOR/VIEWER sharing, but it is built and deployed as the author's own system. Describe it as "deployed and used by the author daily", not as a commercial product with customers. Do not call it "production-ready" for third parties.
- **Data model migration in progress.** `docs/redesign/progress.md` and `docs/redesign/ertelenen-adimlar.md` describe a move to a unified `items` table through a dual-write mirror (`apps/api/src/item-mirror/`). Legacy tables are not yet removed, reads are not fully moved, and the follow-up fixes for that step are still open.
- **No real-database integration tests.** The progress log states that the API tests use mocked persistence, and that rollback, `FOR UPDATE` behaviour and similar DB behaviour were not checked against a real Postgres. Do not claim integration or end-to-end coverage beyond the small `apps/api/test` smoke e2e.
- **MCP tool surface is planned to shrink.** The deferred-steps doc plans to cut the older CRUD tools down to about 20 intent-level tools. The 105 count is accurate today but may change.
- **Known undo limitations** listed in `docs/redesign/progress.md`: undo does not work on shared-project items, occurrence conflict detection is missing, and the "before" snapshot is read without a row lock.
- **Mobile app is small** (about 2,800 lines, 11 source files). Present it as an early companion app, not a full mobile product.
- **Hard-coded timezone** (per-user timezone is deferred) and a development admin seed in the migrations.
- **Hostnames in the repo.** The workflow files and compose file contain the author's real API/web hostnames and port numbers. Do not screenshot `.github/workflows/*.yml` or `docker-compose.yml` as they are; crop or redact them.
- **CI and production run on the same self-hosted host, with no staging environment.** Do not describe it as a staged release process.
- Design docs under `docs/redesign/` are in Turkish and were partly produced in unattended AI-agent coding sessions. Do not present them as client deliverables.
- No [INTEGRATION] items: all integrations are public services (Google Calendar, Gemini, Web Push, Telegram, Slack, Expo push, SMTP).

## 9. Suggested Upwork portfolio entry

**Title:** Self-hosted productivity API with a 105-tool MCP server for Claude

**Description** (154 words):

I built and run a self-hosted productivity platform that an AI assistant can operate directly. It covers tasks, notes, calendar, goals, reminders and a daily time-block planner, with a NestJS API, a Next.js web app and an Expo mobile app in one TypeScript monorepo. The API exposes an MCP server with 105 tools, so Claude can capture, plan and update real data. Every agent write is recorded as a change set that can be undone in one call, with conflict detection if I edited the record afterwards. Access uses scoped personal access tokens checked per tool, and a guard rejects credential-like text. Other pieces: two-way Google Calendar sync with push webhooks, a Postgres-backed job queue, notifications over web push, email, Telegram and Slack, idempotent writes for offline mobile retries, and about 2,000 automated tests. Every push runs CI, and master deploys automatically to my own server with health checks. I use it every day.

**Skill tags:** NestJS, TypeScript, PostgreSQL, Model Context Protocol (MCP), AI Agent Development, Claude API, Next.js, Google Calendar API, Docker, GitHub Actions
