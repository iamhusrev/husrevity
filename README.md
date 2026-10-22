# husrevity

[![CI](https://github.com/iamhusrev/husrevity/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/iamhusrev/husrevity/actions/workflows/ci.yml)
[![Deploy](https://github.com/iamhusrev/husrevity/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/iamhusrev/husrevity/actions/workflows/deploy.yml)

**A self-hosted productivity platform built to be driven by an AI agent.** Tasks, notes, calendar, goals, projects, an encrypted vault and a daily time-block planner — exposed to Claude through a **Model Context Protocol (MCP) server with 100+ tools**, so the agent can capture, plan and update real data while every write it makes stays reviewable and undoable.

NestJS API · Next.js web app · Expo mobile app · one Bun monorepo · in the author's daily use since 2025 (started as a Spring Boot service, later ported to NestJS).

---

## Built for agents: the MCP server

The API ships an MCP server at `POST /api/mcp` (`apps/api/src/mcp`). Point Claude (or any MCP client) at it and the agent works on the same data as the web and mobile apps.

| Concern | How it is handled |
| --- | --- |
| **Tool surface** | 105 tools across tasks, items, notes, calendar, goals, learning, time blocks (Evkat), sport, notifications and trash — plus higher-level tools such as `capture`, `quick_add`, `plan_week` / `apply_plan` and `get_life_context` that let the agent work in intents, not CRUD calls. |
| **Auth & least privilege** | Personal access tokens (32 random bytes, only the SHA-256 is stored, raw token shown once). `PatAuthGuard` authenticates the route; **scopes are checked per tool**, not per route. |
| **Undoable agent writes** | Every agent write is recorded as a **change set**. `undo_change_set` reverts it inside a transaction with a pessimistic lock and returns a per-record conflict list instead of overwriting anything the user edited afterwards. |
| **Input safety** | A secret guard rejects credential-like text in tool input, so an agent can't quietly copy passwords or API keys into notes. |
| **Planning prompts** | MCP prompts guide the agent through weekly and daily planning on top of the tools. |
| **Tested contract** | Tool registration, input schemas and safety rules are covered by specs (`mcp-tools-safety.spec.ts`, `mcp-server-factory.spec.ts`, one spec per tool file). |

The app also uses LLMs directly: **Gemini**-powered "today's suggestions" and voice dictation that parses speech into structured items. Shared projects are never sent to the model — suggestions read only the user's own projects.

---

## Stack

| Layer | Tooling |
| --- | --- |
| Monorepo | Bun 1.3+ workspaces — `apps/api`, `apps/web`, `apps/mobile`, `packages/parser`, `packages/api-client` |
| API | NestJS 10, TypeORM 0.3, PostgreSQL 16, zod, pg-boss (jobs), `@nestjs/schedule` |
| Agent / AI | `@modelcontextprotocol/sdk` (MCP server), Gemini API |
| Web | Next.js 15, React 19, Tailwind 4, TanStack Query, react-i18next |
| Mobile | Expo 52, React Native 0.76, expo-router, delta sync via `/api/sync` |
| Integrations | Google Calendar (two-way), Web Push (VAPID), email, Telegram, Slack, Expo push |
| Quality | Jest (API), Vitest + Testing Library (web), GitHub Actions CI |

## Architecture highlights

- **Feature modules.** 32 self-contained NestJS modules under `apps/api/src`. A global chain applies rate limiting → JWT auth → roles, a whitelisting `ValidationPipe`, a response envelope and a global exception filter.
- **Isolation model.** Every domain query is scoped at the application layer: services take the current user's id explicitly and filter on it. Projects and tasks add collaboration through `ProjectAccessService.requireAccess(userId, projectId, minRole)` with `OWNER` / `EDITOR` / `VIEWER` roles.
- **Token security.** Refresh tokens are random, stored only as SHA-256 hashes and rotated on every use; reusing a rotated token revokes the whole token family. Passwords use bcrypt; auth endpoints have their own throttle.
- **Vault encryption.** AES-256-GCM with a random 12-byte IV per value; the 32-byte key lives only on the server and the API refuses to boot in production without it. Stored Google OAuth tokens use the same service.
- **Google Calendar sync.** Incremental sync tokens with a full-resync fallback on `410 Gone`, push webhooks verified by channel id, resource id and a per-channel secret, and a pg-boss poll as a backstop.
- **Notifications.** A per-minute dispatcher fans scheduled items out to Web Push, email, Telegram, Slack and Expo.
- **Audit & soft delete.** A shared base entity provides soft delete; an audit subscriber records who changed what, fed by an `AsyncLocalStorage` request context. Deleted records can be listed and restored from the trash.

## Testing & CI

- **API:** 100+ Jest spec files (~1,200 tests), including module-graph and entity-relation checks and the MCP safety specs.
- **Web / mobile / parser:** Vitest and Jest suites.
- **CI** (`.github/workflows/ci.yml`) runs on every push and PR: frozen-lockfile install, API build, web build, web lint and API tests.

## Deployment

`master` auto-deploys through a self-hosted GitHub Actions runner (`.github/workflows/deploy.yml`): it builds the `docker-compose.yml` stack (`api` + `web`, both bound to loopback only), restarts it, health-checks the API and smoke-tests the public URL. TLS terminates at a Cloudflare Tunnel, so no inbound port is open. Database migrations run when the API container starts. Secrets never pass through GitHub — the workflow reads a single env file that already lives on the deploy host.

---

## Local development

Prerequisite: a reachable PostgreSQL 16 instance.

```bash
bun install                                   # all workspaces
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

openssl rand -base64 48   # → HUSREVITY_JWT_SECRET (>= 32 bytes)
openssl rand -base64 32   # → HUSREVITY_CRYPTO_KEY  (32 bytes, AES-GCM)
cd apps/api && bunx web-push generate-vapid-keys && cd ../..   # optional: OS-level push

bun run migration:run     # schema + local seed data
bun run dev               # api → http://localhost:4090/api (Swagger: /api/docs)
                          # web → http://localhost:3090
```

Local migrations seed a development admin account (see `apps/api/src/db/migrations`). Never run a public deployment with it.

```bash
bun run dev:api | dev:web     # one app only
bun run build                 # build:api && build:web
bun run test                  # API unit tests
bun run test:e2e              # API smoke e2e
bun run migration:generate    # migration from entity diff
```

## Layout

```
husrevity/
├── apps/
│   ├── api/       # NestJS — feature modules, MCP server (src/mcp), migrations
│   ├── web/       # Next.js 15 web app
│   └── mobile/    # Expo / React Native app
├── packages/
│   ├── parser/      # Turkish natural-language quick-add parser
│   └── api-client/  # shared typed API client
└── docs/redesign/   # design notes, decisions and roadmap
```

[`CLAUDE.md`](./CLAUDE.md) holds the conventions an AI coding agent follows in this repo.

## License

MIT — see [LICENSE](./LICENSE).
