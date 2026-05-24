# PROJECT-STRUCTURE.md — husrevity

> 2026-05-20

---

## 1. What this repo is

`husrevity` is a personal productivity monorepo. The API began as a TypeScript port of a sibling Spring Boot project (`../husrevity-api`) and has since become the **source of truth**; the Spring repo is historical context only. Phase 1 (auth, user, note, list, common, crypto) and Phase 2 (project, task, plan, calendar, reminder, vault, gmail) are fully shipped. The most recent additions are a central push-notification system and the Evkat (time-blocking) domain.

Two apps share a Bun workspace: `apps/api` is a NestJS 10 backend with TypeORM, Postgres, JWT auth, global response envelope, soft-delete + audit base entity, per-minute notification cron, and `@nestjs/throttler`. `apps/web` is a Next.js 15 App Router frontend with React 19, Tailwind 4, and TanStack Query, wired exclusively to the NestJS contract. The web is always subordinate to the API — when the two disagree, fix the web.

---

## 2. System topology

### Dev (local)

```
developer machine
├── shared-infra (sibling repo)
│   └── docker compose up -d
│       └── postgres:16  (:5432, DB: husrevity_nest)
│
├── apps/api   (bun run dev:api)
│   └── http://localhost:4090/api
│       swagger: /api/docs
│
└── apps/web   (bun run dev:web)
    └── http://localhost:3090
        NEXT_PUBLIC_API_URL=http://localhost:4090/api
```

`bun run dev` boots both in parallel via `concurrently --kill-others-on-fail`.

### Prod (self-hosted Mac)

```
Internet
  │
  ▼
Cloudflare Edge (Universal TLS, WAF, DDoS)
  │
  ▼
Cloudflare Tunnel (named "husrevity", credentials.json @ ~/.config/husrevity/cloudflared/)
  │  ingress: app.iamhusrev.com → 127.0.0.1:3090
  │           api.iamhusrev.com → 127.0.0.1:4090
  │
  ▼
prod Mac — no open inbound ports; static public IP 85.104.115.220 reserved for ops (SSH/future mobile API)
  │
  ▼
docker-compose.prod.yml
  ├── husrevity-prod-web         (Next.js standalone, bind 127.0.0.1:3090)
  ├── husrevity-prod-api         (NestJS, runs migrations on boot, bind 127.0.0.1:4090)
  │       └── env_file: apps/api/.env.prod (→ ~/.husrevity/api.env)
  └── husrevity-prod-postgres    (postgres:16-alpine)
          volume: husrevity_pgdata
```

Boot order enforced by `docker-compose.prod.yml`: **postgres** (healthcheck) → **api** (depends_on healthy postgres) → **web**. Cloudflare Tunnel runs natively as a `launchd` LaunchAgent (not a compose service) so it survives Docker Desktop restarts.

The prod Mac must never sleep (System Settings → Battery) and Docker Desktop must auto-start. Prod runs on the same physical machine as the self-hosted GitHub Actions runner.

---

## 3. Tech stack matrix

| Concern | Dev | Prod |
|---|---|---|
| Runtime / pkg mgr | Bun 1.3+ (workspaces) | Bun 1.3 in Docker (multi-stage) |
| API framework | NestJS 10 | same |
| ORM | TypeORM 0.3 | same |
| Database | Postgres 16 (shared-infra container) | Postgres 16 (compose service) |
| Auth | Passport-JWT + `JwtAuthGuard` (APP_GUARD) | same |
| Migrations | TypeORM TS migrations, `migrationsRun: false`, manual via CLI | run by `docker-entrypoint.sh` on container boot |
| Scheduler | `@nestjs/schedule` + `ScheduleModule.forRoot()` | same |
| Web push | `web-push` npm package + VAPID keys (optional; bell works without) | same |
| Mailer | none | none |
| Rate limiting | `@nestjs/throttler` (100 req / 60 s window, global) | same |
| Web framework | Next.js 15 App Router, React 19, Tailwind 4, TanStack Query v5 | Next.js standalone build in Docker |
| HTTP proxy | — (direct) | Cloudflare Tunnel (named, TLS at CF edge — no open ports on host) |
| Orchestration | `concurrently` | `docker compose` |
| CI/CD | — | GitHub Actions self-hosted runner on prod Mac |
| Monitoring | — | External HTTP monitors (UptimeRobot / BetterStack); `GET /api/health` |
| Backups | LaunchAgent daily 03:00 → `pg_dump` → Drive | LaunchAgent daily 04:00 (prod DB) |

---

## 4. The request lifecycle

Traced through `POST /api/reminders` — a guarded endpoint that also enqueues a notification.

```
1. HTTP enters main.ts
   ├── app.set('trust proxy', 1)           # real client IP for throttler (behind Cloudflare Tunnel)
   ├── helmet()                            # security headers
   └── bodyParser.text('text/plain')       # vault .env import carve-out (before guards)

2. Global guards (app.module.ts, registered as APP_GUARD in order):
   a. ThrottlerGuard      — 100 req/60 s per IP; 429 on breach
   b. JwtAuthGuard        — reads @Public() reflector; else calls Passport JWT strategy
      └── JwtStrategy.validate(payload)    # → { userId, email } = AuthenticatedUser
          └── requestContext.enterWith(…)  # AsyncLocalStorage; AuditSubscriber reads this
   c. RolesGuard          — no-op unless @Roles() is present (removed post-DropRoles migration)

3. ValidationPipe (global, main.ts)
   ├── whitelist: true, transform: true
   └── exceptionFactory → ApiException.badRequest()  on class-validator failure

4. ReminderController.create()             apps/api/src/reminder/reminder.controller.ts
   ├── @Post('reminders'), @HttpCode(201)
   └── @CurrentUser() → AuthenticatedUser from req.user

5. ReminderService.createReminder(ownerId, body)   apps/api/src/reminder/reminder.service.ts:117
   ├── requireList(ownerId, body.listId)   # throws ApiException.notFound if not found
   ├── this.reminders.create({…})          # populate entity fields
   ├── await this.reminders.save(r)        # TypeORM INSERT
   │     └── AuditSubscriber.beforeInsert()  # sets createdById/updatedById from AsyncLocalStorage
   └── await this.syncNotification(saved)  # side-effect

6. syncNotification(r)                     apps/api/src/reminder/reminder.service.ts:195
   ├── notifications.cancelForSource(ownerId, 'reminder', r.id)   # soft-delete any prior rows
   ├── leadTimeFireAt(r.dueAt, r.notifyMinutesBefore)             # notification-scheduling.ts
   └── notifications.enqueue({ ownerId, kind: 'reminder', … })   # INSERT into notification table
         └── partial-unique index uq_notification_source_live prevents duplicates

7. ResponseInterceptor (global, main.ts)   apps/api/src/common/response.interceptor.ts
   └── wraps return value in { success: true, message: 'OK', code: 201, data: ReminderResponseDto }

8. HTTP 201 response leaves the process
```

If anything throws an `ApiException` at any step, `GlobalExceptionFilter` catches it and emits:
```json
{ "success": false, "message": "…", "code": 4xx, "data": null }
```

---

## 5. Cross-cutting conventions

### Response envelope

Every controller return value is wrapped by `ResponseInterceptor` (`apps/api/src/common/response.interceptor.ts`). The interceptor sniffs for a `success` boolean to skip re-wrapping (for controllers that pre-build the envelope).

```ts
// successful response shape
{ success: true, message: 'OK', code: 200, data: <T> }
// error shape (GlobalExceptionFilter)
{ success: false, message: 'Not found', code: 404, data: null }
```

The web's `apps/web/src/services/api-client.ts` parses exactly this shape; the TanStack Query hooks select `d.data` to unwrap.

### Error type — `ApiException` and `GlobalExceptionFilter`

`apps/api/src/common/api.exception.ts` — factory methods (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`) extend `HttpException`. Services throw these instead of raw `Error` or NestJS HTTP exceptions.

`GlobalExceptionFilter` (`apps/api/src/common/global-exception.filter.ts`) catches everything with `@Catch()` and maps to the envelope. Unrecognised errors log a stack trace and return 500.

```ts
throw ApiException.notFound('Reminder list not found');
// → { success: false, message: 'Reminder list not found', code: 404, data: null }
```

### Auth: `JwtAuthGuard`, `@Public()`, `@CurrentUser()`

`JwtAuthGuard` (`apps/api/src/auth/jwt-auth.guard.ts`) is registered as an `APP_GUARD` — every route is protected unless the handler or class is decorated with `@Public()` (`apps/api/src/common/public.decorator.ts`). After Passport validates the JWT, `handleRequest` enters the `AsyncLocalStorage` context for the request's lifetime.

Public paths: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/health`, `GET /api/docs/*`.

`@CurrentUser()` (`apps/api/src/common/current-user.decorator.ts`) is a param decorator that reads `req.user` (set by `JwtStrategy.validate()`).

```ts
@Post('reminders')
create(@CurrentUser() u: AuthenticatedUser, @Body() body: ReminderRequestDto) { … }
```

### Validation

`ValidationPipe` registered globally in `apps/api/src/main.ts` with `whitelist: true, transform: true`. Validation failures call the `exceptionFactory`, which converts `ValidationError[]` into a single `ApiException.badRequest()`. DTOs use `class-validator` decorators; DTOs for body params define the allowed shape and extra keys are stripped silently (`whitelist: true`, `forbidNonWhitelisted: false`).

**Reorder body gotcha**: reorder endpoints expect `{ items: [{ id, position }] }` wrapped in a `ReorderRequestDto` — a bare array is rejected by `whitelist: true`.

### Soft-delete + audit: `BaseEntity`, `AuditSubscriber`, `RequestContext`

All domain entities extend `BaseEntity` (`apps/api/src/common/base.entity.ts`):

```ts
abstract class BaseEntity {
  id: string;           // bigserial PK
  createdAt: Date;      // @CreateDateColumn
  createdById: string;  // set by AuditSubscriber
  updatedAt: Date;      // @UpdateDateColumn
  updatedById: string;  // set by AuditSubscriber
  deletedAt: Date|null; // @DeleteDateColumn — NULL = live row
}
```

`AuditSubscriber` (`apps/api/src/common/audit.subscriber.ts`) is a TypeORM `EntitySubscriberInterface` registered in `typeorm.config.ts`. It reads the current user from `requestContext` (`apps/api/src/common/request-context.ts`) — a plain `AsyncLocalStorage<{ userId, email }>` entered by `JwtAuthGuard.handleRequest()` on every authenticated request.

Do not set `createdById`/`updatedById` manually in service code.

### Multi-tenancy

Every domain service method takes `ownerId` as the first parameter (extracted from `@CurrentUser()`). All repository queries include a `WHERE owner_id = :ownerId` clause. There is no shared-data model; isolation is entirely by `owner_id`.

### Throttling

`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` in `app.module.ts` gives a global 100-req/60-s budget per IP. `ThrottlerGuard` is the first `APP_GUARD` so throttle checks precede auth. Per-route overrides use `@Throttle({ default: { limit: 10, ttl: 60_000 } })` — used on the push-subscription endpoint to defend against device flooding.

### Scheduling

`ScheduleModule.forRoot()` loaded in `app.module.ts`. The only scheduled job is `NotificationDispatcherService.tick()` (`apps/api/src/notification/notification-dispatcher.service.ts`) decorated with `@Cron(CronExpression.EVERY_MINUTE)`. `AuthService` also has a nightly cron (03:00) to clean up expired/revoked refresh tokens.

---

## 6. Module catalogue

Modules are explicit — no component scanning. All are listed in `apps/api/src/app.module.ts`.

---

### `common/` — shared infrastructure (no NestJS module; consumed by all)

**Path**: `apps/api/src/common/`  
**Purpose**: Base classes, interceptors, filters, guards, and decorators used by every module.  
**Persisted state**: none (infrastructure only).  
**HTTP surface**: `GET /api/health` (`@Public`, no auth) via `HealthController`.  
**Cross-module deps**: imported by all modules; exports nothing (not a NestJS module).  
**Notable invariants**:
- `BaseEntity` must be the superclass of every entity. Omitting it breaks soft-delete and audit.
- `RequestContext` AsyncLocalStorage is entered by `JwtAuthGuard` on authenticated requests only — calling `getCurrentUserId()` on a `@Public` route returns `null`.
- `HealthController` does a real DB ping (`SELECT 1`) with a 500 ms timeout; 503 if the DB is unreachable.

---

### `auth/` — authentication and token lifecycle

**Path**: `apps/api/src/auth/`  
**Purpose**: Register, login, token refresh, logout, and nightly refresh-token cleanup.  
**Persisted state**: `refresh_token` (token_hash VARCHAR(128) UNIQUE, user_id FK, expires_at, revoked BOOL).  
**HTTP surface** (all `@Public`):

| Verb | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | Creates user + issues token pair |
| `POST` | `/api/auth/login` | Validates creds, issues token pair |
| `POST` | `/api/auth/refresh` | Rotates refresh token (revoke old, issue new) |
| `POST` | `/api/auth/logout` | Revokes all refresh tokens for the user |

**Cross-module deps**: imports `UserModule`; exports `AuthService` (consumed by nothing else directly).  
**Notable invariants**:
- Refresh tokens are opaque random bytes, SHA-256 hashed at rest. JWT rotation does not invalidate them.
- `AuthService` has a `@Cron('0 3 * * *')` (03:00 daily) that deletes expired/revoked `refresh_token` rows.
- Access token TTL: 15 min (env: `HUSREVITY_JWT_ACCESS_TTL`). Refresh token TTL: 30 days.
- `JwtStrategy` rejects secrets under 32 bytes or starting with `'replace-'`.

---

### `user/` — user profile

**Path**: `apps/api/src/user/`  
**Purpose**: Current-user profile read and update; user entity repository.  
**Persisted state**: `app_user` (email, password_hash, first_name, last_name, enabled; `app_user_role` table dropped by `DropRoles` migration).  
**HTTP surface**:

| Verb | Path | Auth |
|---|---|---|
| `GET` | `/api/users/me` | JWT |
| `PUT` | `/api/users/me` | JWT |

**Cross-module deps**: exports `UserService` and `TypeOrmModule` (re-exported so `AuthModule` gets the `User` repository).  
**Notable invariants**: The `role` and `app_user_role` tables were dropped in migration `1715000004000-DropRoles`; `User` entity has no roles relation.

---

### `note/` — notes with tags

**Path**: `apps/api/src/note/`  
**Purpose**: Markdown notes with per-user tags, pinning, archiving, and an optional background colour.  
**Persisted state**: `note` (title, body_markdown, pinned, archived, position, color_hex), `note_tag` (owner_id, name, color), `note_tag_assignment` (note_id, tag_id).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/notes` |
| `GET/PUT/DELETE` | `/api/notes/:id` |
| `PATCH` | `/api/notes/reorder` |
| `GET/POST` | `/api/note-tags` |
| `PUT/DELETE` | `/api/note-tags/:id` |

**Cross-module deps**: exports `NoteService` (consumed by `AiModule`).  
**Notable invariants**: `NoteService` is injected into `AiChatService` to build Gemini context. `color_hex` column added by migration `1715000005000-AddNoteColor`.

---

### `list/` — todo lists with items

**Path**: `apps/api/src/list/`  
**Purpose**: Named todo lists (archived flag, position) containing checklist items with optional due dates and lead-time notifications.  
**Persisted state**: `todo_list` (name, color, icon, archived, position), `list_item` (text, done, due_at, position, notify_minutes_before).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/lists` |
| `PUT/DELETE` | `/api/lists/:id` |
| `PATCH` | `/api/lists/reorder` |
| `GET/POST` | `/api/lists/:id/items` |
| `PUT/DELETE` | `/api/lists/:id/items/:itemId` |
| `POST` | `/api/lists/:id/items/:itemId/toggle` |
| `PATCH` | `/api/lists/:id/items/reorder` |

**Cross-module deps**: imports `NotificationModule` (to sync notifications on item mutations).  
**Notable invariants**: `notify_minutes_before` added to `list_item` in migration `1715000009000`. `syncNotification()` is called after every create/update/toggle/delete of a list item (same pattern as Reminder).

---

### `project/` — projects

**Path**: `apps/api/src/project/`  
**Purpose**: Lightweight project tracker with `code` (unique per owner), status, and date range.  
**Persisted state**: `project` (code VARCHAR(32), name, description, status VARCHAR(32) DEFAULT 'ACTIVE', start_date DATE, end_date DATE); unique constraint `(owner_id, code)`.  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/projects` |
| `GET/PUT/DELETE` | `/api/projects/:code` |

**Cross-module deps**: exports `ProjectService` (consumed by `TaskModule` and `AiModule`).  
**Notable invariants**: Project is referenced by `code` (human-readable slug), not ID, in controller routes. `start_date`/`end_date` are date-only columns — no notifications in V1.

---

### `task/` — tasks linked to projects

**Path**: `apps/api/src/task/`  
**Purpose**: Tasks with status, priority, optional project association, due date, position, and lead-time notifications.  
**Persisted state**: `task` (owner_id, project_id FK → project(id) ON DELETE SET NULL, title, description, status, priority, due_at, position, notify_minutes_before).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/tasks` |
| `GET/PUT/DELETE` | `/api/tasks/:id` |
| `PATCH` | `/api/tasks/:id/status`, `/api/tasks/reorder` |

**Cross-module deps**: imports `ProjectModule` (validates project ownership), `NotificationModule`; exports `TaskService` (consumed by `AiModule`).  
**Notable invariants**: `notify_minutes_before` added in migration `1715000009000`. `syncNotification()` called on every mutation.

---

### `plan/` — plans with items

**Path**: `apps/api/src/plan/`  
**Purpose**: Goal-oriented plans containing ordered items (milestones/steps) with status tracking.  
**Persisted state**: `plan` (title, description, target_date DATE, status), `plan_item` (plan_id FK, text, done, position, target_date DATE).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/plans` |
| `GET/PUT/DELETE` | `/api/plans/:id` |
| `POST/PUT/DELETE` | `/api/plans/:id/items`, `/api/plans/:id/items/:itemId` |
| `PATCH` | `/api/plans/:id/items/reorder` |

**Cross-module deps**: exports `PlanService` (consumed by `AiModule`).  
**Notable invariants**: `target_date` fields are date-only; no notifications in V1. RRULE-based recurring fan-out is deferred (Faz 5).

---

### `calendar/` — calendar events

**Path**: `apps/api/src/calendar/`  
**Purpose**: Calendar events with optional recurrence rule, all-day flag, and `reminder_minutes` lead-time.  
**Persisted state**: `calendar_event` (owner_id, title, description, start_at, end_at, all_day BOOL, recurrence_rule VARCHAR, location, reminder_minutes INT).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/calendar-events` |
| `GET/PUT/DELETE` | `/api/calendar-events/:id` |

**Cross-module deps**: imports `NotificationModule`; no exports.  
**Notable invariants**: `reminder_minutes` (the lead-time column) predates the migration `1715000009000` pattern — it was added in `Phase2`. RRULE fan-out for recurring events is not yet implemented (single notification per event, not per occurrence).

---

### `reminder/` — reminder lists and reminders

**Path**: `apps/api/src/reminder/`  
**Purpose**: Apple Reminders-style lists of timed reminders with priority, flag, and lead-time push notifications.  
**Persisted state**: `reminder_list` (name, color, icon, position), `reminder` (list_id FK nullable, title, notes, due_at, completed_at, priority, flag, position, notify_minutes_before).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/reminder-lists` |
| `PUT/DELETE` | `/api/reminder-lists/:id` |
| `PATCH` | `/api/reminder-lists/reorder` |
| `GET` | `/api/reminder-lists/:id/reminders` |
| `GET/POST` | `/api/reminders` |
| `PUT/DELETE` | `/api/reminders/:id` |
| `POST` | `/api/reminders/:id/toggle` |
| `PATCH` | `/api/reminders/reorder` |

**Cross-module deps**: imports `NotificationModule`; exports `ReminderService` (consumed by `AiModule`).  
**Notable invariants**: `syncNotification()` is called after every create/update/toggle. On delete, `cancelForSource` is called directly before `softRemove`. `notify_minutes_before` stores the lead-time in minutes; `NULL` disables notifications for that reminder.

---

### `vault/` — encrypted key-value store

**Path**: `apps/api/src/vault/`  
**Purpose**: AES-GCM-encrypted secrets store; vault entries group vault items (key + encrypted value).  
**Persisted state**: `vault_entity` (owner_id, name, category, description, icon, color), `vault_item` (entity_id FK, key VARCHAR(128), value_enc TEXT).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/vault-entities` |
| `PUT/DELETE` | `/api/vault-entities/:id` |
| `POST` | `/api/vault-entities/:id/items` |
| `PUT/DELETE` | `/api/vault-entities/:id/items/:itemId` |
| `POST` | `/api/vault-entities/:id/import-env` |

**Cross-module deps**: `VaultModule` has no imports of domain modules; `CryptoModule` is `@Global()` so `CryptoService` is injected without explicit import.  
**Notable invariants**:
- `POST /api/vault-entities/:id/import-env` accepts `Content-Type: text/plain`. The `bodyParser.text` middleware registered in `main.ts` is mandatory for this path — do not remove it.
- Encryption is done by `CryptoService.encrypt()` before persisting; decryption on read. The key is `HUSREVITY_CRYPTO_KEY` (32 bytes, base64). Rotating this key = permanent data loss without a re-encrypt migration. See `ops/SECRETS.md`.
- Gmail OAuth tokens are also encrypted by `CryptoService` (see `gmail/` below).

---

### `gmail/` — Google and Microsoft mail/calendar integration

**Path**: `apps/api/src/gmail/`  
**Purpose**: OAuth2 account linking for Google (Gmail, Calendar, Contacts, Drive) and Microsoft (Outlook via Graph API), with token refresh and message caching.  
**Persisted state**: `gmail_account` (owner_id, provider 'google'|'microsoft', email, display_name, access_token_enc, refresh_token_enc, token_expires_at, scopes, history_id, last_sync_at), `gmail_message` (account_id, message_id, snippet, subject, sender, received_at, etc.).  
**HTTP surface** (selection):

| Verb | Path | Notes |
|---|---|---|
| `GET` | `/api/gmail/accounts` | List connected accounts |
| `DELETE` | `/api/gmail/accounts/:id` | Disconnect |
| `GET` | `/api/gmail/accounts/:id/messages` | Sync + paginate messages |
| `GET` | `/api/gmail-oauth/google/authorize` | Redirect to Google consent |
| `GET` | `/api/gmail-oauth/google/callback` | Exchange code + store tokens |
| `GET` | `/api/gmail-oauth/microsoft/authorize` | Redirect to MS consent |
| `GET` | `/api/gmail-oauth/microsoft/callback` | Exchange code + store tokens |
| `GET` | `/api/google-data/calendar`, `/contacts`, `/drive` | Read external data |

**Cross-module deps**: no imports of other domain modules; `CryptoModule` global for token encryption.  
**Notable invariants**:
- OAuth `state` param encodes `userId` (base64 JSON) so the callback knows who to link the account to without a server-side session.
- The `(owner_id, email, provider)` uniqueness is enforced via a partial unique index (`WHERE deleted_at IS NULL`, added in `1715000008000-GmailAccountUniquePartial`) to allow reconnecting a previously soft-deleted account.
- `GOOGLE_CLIENT_SECRET` / `MICROSOFT_CLIENT_SECRET` are optional env vars; the module registers only what is configured.

---

### `notification/` — central notification hub

**Path**: `apps/api/src/notification/`  
**Purpose**: Unified notification queue (scheduled-at table) + web-push delivery + in-app bell feed.  
**Persisted state**:
- `notification` (owner_id, kind VARCHAR(32), source_id, scheduled_at, dispatched_at, read_at, title, body, deep_link) — `kind` ∈ `'reminder' | 'task' | 'list_item' | 'calendar_event' | 'time_block'`.
- `push_subscription` (owner_id, endpoint TEXT, p256dh TEXT, auth TEXT, user_agent, last_used_at).

**HTTP surface**:

| Verb | Path | Notes |
|---|---|---|
| `GET` | `/api/notifications` | Bell feed (dispatched or due within 1 min) |
| `GET` | `/api/notifications/unread-count` | Badge count |
| `PATCH` | `/api/notifications/:id/read` | Mark one read |
| `PATCH` | `/api/notifications/read-all` | Mark all read |
| `GET` | `/api/notifications/vapid-public-key` | VAPID key for SW subscription |
| `POST` | `/api/notifications/push-subscriptions` | Register device (throttled 10/60s) |
| `DELETE` | `/api/notifications/push-subscriptions` | Unregister device |

**Cross-module deps**: imported by `reminder`, `list`, `task`, `calendar`, `time-block`; exports `NotificationService`.  
**Notable invariants**:
- `enqueue()` is idempotent: the partial-unique index `uq_notification_source_live` on `(owner_id, kind, source_id, scheduled_at) WHERE deleted_at IS NULL` turns a duplicate enqueue into an UPDATE of the existing row (refreshes title/body copy if the domain entity was edited).
- `cancelForSource()` soft-deletes all undispatched rows for a source — call before re-enqueue on update.
- `NotificationDispatcherService.tick()` runs `@Cron(EVERY_MINUTE)`. It marks rows dispatched **before** fan-out so an overlapping tick never double-fires. 410/404 from a push endpoint = subscription expired → soft-delete it.
- VAPID keys are optional. When not configured, the dispatcher logs a warning and exits the push path; the bell dropdown still works because it reads the same `notification` table.
- `VAPID_PRIVATE_KEY` rotation invalidates all existing device subscriptions — users must re-opt-in. See `ops/SECRETS.md`.

---

### `time-block/` — Evkat daily time-blocking (new)

**Path**: `apps/api/src/time-block/`  
**Purpose**: Daily hour-stack planner (intent tracking, distinct from calendar events).  
**Persisted state**: `time_block` (owner_id, title, notes, start_at, end_at, category VARCHAR(32), color_token VARCHAR(24), notify_minutes_before, completed_at). Index on `(owner_id, start_at)`.  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET` | `/api/time-blocks?date=YYYY-MM-DD` |
| `GET` | `/api/time-blocks?from=…&to=…` |
| `POST` | `/api/time-blocks` |
| `PUT` | `/api/time-blocks/:id` |
| `DELETE` | `/api/time-blocks/:id` |
| `POST` | `/api/time-blocks/:id/toggle` |

**Cross-module deps**: imports `NotificationModule`; exports `TimeBlockService`.  
**Notable invariants**: `category` is a soft enum (`'work' | 'focus' | 'rest' | 'exercise' | 'family' | 'other'`); the column is free-form VARCHAR so adding future categories requires no migration. `color_token` maps to a Husrev design-system token name (e.g. `husrev-amber`).

---

### `crypto/` — AES-GCM encryption utility

**Path**: `apps/api/src/crypto/`  
**Purpose**: `CryptoService` providing `encrypt(plain)` → base64(IV||ciphertext||tag) and `decrypt(enc)` → plaintext, using AES-256-GCM.  
**Persisted state**: none (stateless service).  
**HTTP surface**: none.  
**Cross-module deps**: `@Global()` module; auto-available to all modules without explicit import. Consumed by `VaultModule` (vault item values) and `GmailModule` (OAuth tokens).  
**Notable invariants**: `HUSREVITY_CRYPTO_KEY` is 32 bytes base64. There is no key ID or fallback. Rotating the key = all encrypted rows become unreadable. See `ops/SECRETS.md`.

---

### `ai/` — AI chat and suggestions via Gemini

**Path**: `apps/api/src/ai/`  
**Purpose**: Persistent chat conversations with a Gemini LLM, injecting the user's current projects, plans, and notes as context. A secondary suggestion controller provides one-shot AI hints.  
**Persisted state**: `ai_conversation` (owner_id, title), `ai_message` (owner_id, conversation_id, role VARCHAR(16), content TEXT).  
**HTTP surface**:

| Verb | Path |
|---|---|
| `GET/POST` | `/api/ai/conversations` |
| `DELETE` | `/api/ai/conversations/:id` |
| `GET` | `/api/ai/conversations/:id/messages` |
| `POST` | `/api/ai/conversations/:id/messages` |
| `POST` | `/api/ai/suggestions` |

**Cross-module deps**: imports `ProjectModule`, `PlanModule`, `NoteModule`, `ReminderModule`, `TaskModule` (to read context for the system prompt).  
**Notable invariants**: `AiChatService` fetches up to 20 recent projects/plans/notes as context and the last 20 messages as history. Gemini is called via plain `fetch` to `https://generativelanguage.googleapis.com/v1beta/models/…`. `GOOGLE_GEMINI_API_KEY` env var required; feature degrades gracefully if absent (throws 500 on first use).

---

## 7. Frontend mirror — `apps/web`

### Route groups

| Group | Path | Purpose |
|---|---|---|
| `(landing)` | `apps/web/src/app/(landing)/` | Public marketing / landing (no auth required) |
| `(auth)` | `apps/web/src/app/(auth)/` | Login and register pages |
| `(app)` | `apps/web/src/app/(app)/` | Protected pages; layout redirects unauthenticated users to `/login` |

The `(app)` layout (`apps/web/src/app/(app)/layout.tsx`) is a client component that calls `useAuth()` and redirects on `!isAuthenticated`. It also mounts `<NotificationPermissionPrompt />` so the prompt appears once per session on any app page.

Domain routes under `(app)`: `dashboard`, `notes`, `notes/[id]`, `notes/new`, `lists`, `lists/[id]`, `projects`, `projects/[code]`, `plans`, `plans/[id]`, `calendar`, `reminders`, `reminders/[listId]`, `vault`, `gmail`, `ai`, `evkat`, `settings`, `settings/profile`.

### Provider stack (root `layout.tsx`)

Defined in `apps/web/src/app/layout.tsx`. Nesting order matters — outer providers are available to inner ones:

```
I18nProvider
  └── ReactQueryProvider
        └── AuthProvider        ← JWT state + push subscription boot
              └── ThemeProvider
                    └── SidebarProvider
                          └── {children}
```

`GlobalAlert` (toast) is rendered inside `ThemeProvider` and outside `SidebarProvider`.

### The trio pattern (types + service + hook + view)

Every domain follows the same four-layer structure. Example: **reminders**.

```
apps/web/src/types/reminder/reminder.ts         ← TypeScript types mirroring the API DTOs
apps/web/src/services/reminder-service.ts       ← Axios calls via apiClient; returns ApiResponse<T>
apps/web/src/hooks/useReminders.ts              ← TanStack Query hooks:
                                                    useReminderLists, useReminders,
                                                    useCreateReminder, useUpdateReminder,
                                                    useToggleReminder, useDeleteReminder,
                                                    useReorderReminders, …
apps/web/src/views/reminders/RemindersView.tsx  ← Page-level client component consuming the hooks
apps/web/src/app/(app)/reminders/page.tsx       ← Next.js RSC shell that renders the view
```

When adding a new domain, copy this structure. The hook file must export the full CRUD set. Do not call `apiClient` directly from a component.

### Design system tokens

Defined in `apps/web/src/app/globals.css` under `@theme` and as global CSS classes. Tailwind 4 `@theme` directive exposes them as `bg-husrev-*`, `text-husrev-*`, etc.

**Color tokens** (CSS variables, also available as Tailwind utilities):

| Token | Hex | Usage |
|---|---|---|
| `husrev-cream` | `#f6f3ec` | Default page background (light) |
| `husrev-sand` | `#ebe5d6` | Subtle border / secondary surface |
| `husrev-ink` | `#1a1814` | Default page background (dark) / primary text (light) |
| `husrev-shadow` | `#2b2823` | Dark ink-adjacent accent |
| `husrev-amber` | `#c8732e` | Accent / focus rings / CTA hover |
| `husrev-ember` | `#a14d18` | Primary CTA background (`brand-500`) |
| `husrev-moss` | `#5a6b3a` | Success / nature accent |

**`shadow-card-warm`**: Multi-layer box-shadow with a white top-inset gloss + warm-tone drop shadow; applied to card surfaces for depth.

**Design system utilities** (plain CSS classes, not Tailwind utilities):

| Class | Purpose |
|---|---|
| `grain` | Paper grain texture overlay (radial dot pattern, `::before` pseudo, `pointer-events: none`) |
| `husrev-lift` | Hover: translateY(-2px) + warm drop-shadow — applied to interactive cards |
| `husrev-rule` | Full-width gradient ornament line (sand→amber→sand) |
| `husrev-kicker` | JetBrains Mono, 11px, 0.16em letter-spacing, uppercase — section labels |
| `husrev-stamp-month` + `husrev-stamp-day` | Serif italic month + numeric day for date stamps |
| `husrev-pill` | Mono uppercase chip with warm sand background |
| `husrev-input` | Refined text input with amber focus ring |
| `husrev-modal` | Warm-gradient modal panel with layered box-shadow |
| `husrev-btn` | Primary button (ember background, cream text, lift on hover) |
| `husrev-btn-ghost` | Ghost button (transparent, sand border on hover) |
| `husrev-settle` | Entry animation: settle from below with spring easing |
| `husrev-fade-up` | Simple fade-up entry animation |
| `husrev-stagger` | Staggered entrance on direct children (up to 10, 40ms increments) |
| `husrev-shimmer` | Shimmer sweep animation for hero hairlines |
| `word-underline` | Amber highlight underline (inline gradient, used on hero words) |

Fonts: Outfit (sans, UI default), Instrument Serif (editorial/stamp), JetBrains Mono (kicker/pill). All loaded via `next/font/google`.

### Notification flow on the client

1. **SW registration trigger** — `AuthProvider` (`apps/web/src/providers/AuthProvider.tsx:51`) calls `pushService.registerIfPreviouslyEnabled()` on every authenticated boot. No-op if permission is not granted or preference flag (`husrevity.pushEnabled` in localStorage) is `'0'`.

2. **Push subscription lifecycle** — `apps/web/src/services/push-service.ts`:
   - `enablePush()`: `Notification.requestPermission()` → fetch VAPID public key from `GET /api/notifications/vapid-public-key` → `navigator.serviceWorker.register('/sw.js')` → `pushManager.subscribe()` → `POST /api/notifications/push-subscriptions`.
   - `disablePush()`: `DELETE /api/notifications/push-subscriptions` → `sub.unsubscribe()` → clear localStorage flag.
   - `registerIfPreviouslyEnabled()`: silent re-subscribe on page load (the browser may have re-issued a new subscription endpoint).

3. **Bell dropdown polling** — `useNotifications` and `useUnreadNotificationCount` (`apps/web/src/hooks/useNotifications.ts`) poll every 30 seconds with `refetchOnWindowFocus: true`. The badge pulse-animates when `unread > 0`.

4. **Permission prompt placement** — `<NotificationPermissionPrompt />` (`apps/web/src/components/notifications/NotificationPermissionPrompt.tsx`) is rendered inside the `(app)` layout so it appears once per session for users who haven't opted in.

5. **Service worker** — `apps/web/public/sw.js`. Minimal: handles `push` events (shows OS notification), `notificationclick` (focuses/navigates an open tab or opens a new window to `deepLink`). Does not intercept fetches or cache assets.

### Evkat page architecture

**Path**: `apps/web/src/views/evkat/EvkatPage.tsx`, mounted at `/evkat`.

The page renders a daily hour-stack from 06:00 to 24:00 (18 hours × 60 px/hour = 1080 px total height). Each `TimeBlock` is positioned absolutely at `top = (startHour - 6) * HOUR_PX + (startMinute / 60) * HOUR_PX` and height = `durationMinutes * (HOUR_PX / 60)`.

Blocks carry a **category** (soft enum: work/focus/rest/exercise/family/other) and an optional **color_token** override (any `husrev-*` token name). The left stripe color maps `colorToken → bg-husrev-amber` etc. via a lookup table at the top of the file.

An edit modal (inline state, no routing) opens on block click, accepting title, notes, start/end time, category, color, and `notifyMinutesBefore`. The completion toggle calls `POST /api/time-blocks/:id/toggle` and invalidates the `time-blocks` query key.

---

## 8. Data lifecycle & migrations

Files in `apps/api/src/db/migrations/`, applied in timestamp order by `bun run migration:run` (dev) or `docker-entrypoint.sh` (prod).

| File | What it does |
|---|---|
| `1715000000000-Baseline.ts` | Phase 1 schema: `role`, `app_user`, `app_user_role`, `refresh_token`, `note_tag`, `note`, `note_tag_assignment`, `todo_list`, `list_item` + all indexes. |
| `1715000001000-SeedAdmin.ts` | Inserts `admin@admin.com / admin` (bcrypt). Idempotent — no-op if the row exists. |
| `1715000002000-Phase2.ts` | Phase 2 schema: `project`, `task`, `plan`, `plan_item`, `calendar_event`, `reminder_list`, `reminder`, `vault_entity`, `vault_item`, `gmail_account`, `gmail_message`. |
| `1715000003000-RemoveDefaultAdmin.ts` | Prod-only: replaces the seeded admin with one from env vars (`HUSREVITY_INITIAL_ADMIN_EMAIL` + `HUSREVITY_INITIAL_ADMIN_PASSWORD_HASH`), then deletes `admin@admin.com`. Throws if default exists and env vars missing in `NODE_ENV=production`. No-op in dev. |
| `1715000004000-DropRoles.ts` | Drops `app_user_role` and `role` tables. All users are equal; isolation is by `owner_id` only. |
| `1715000005000-AddNoteColor.ts` | Adds `color_hex VARCHAR(16)` to `note` (Google-Keep-style background colour). |
| `1715000006000-AiTables.ts` | Creates `ai_conversation` and `ai_message` with owner + conversation indexes. |
| `1715000007000-AccountProvider.ts` | Adds `provider VARCHAR(16) DEFAULT 'google'` to `gmail_account`; widens uniqueness constraint to include provider. |
| `1715000008000-GmailAccountUniquePartial.ts` | Replaces the plain `UNIQUE` constraint on `(owner_id, email, provider)` with a partial unique index `WHERE deleted_at IS NULL` so soft-deleted accounts can be reconnected. |
| `1715000009000-NotificationsAndTimeBlock.ts` | Creates `push_subscription`, `notification` (with idempotent partial-unique index on `(owner_id, kind, source_id, scheduled_at)`), and `time_block`. Adds `notify_minutes_before` to `reminder`, `task`, and `list_item`. |

Migration invariants:
- `synchronize: false` always — never let TypeORM auto-sync.
- Never edit a recorded migration. Add a new one instead.
- Generate: `cd apps/api && bun run migration:generate src/db/migrations/AddXToY`.

---

## 9. Build, run, deploy

### Dev boot order

```bash
# 1. shared postgres (sibling repo)
(cd "../shared-infra" && docker compose up -d)

# 2. install workspace dependencies
bun install

# 3. copy env files (one-time)
cp apps/api/.env.example apps/api/.env      # fill in secrets
cp apps/web/.env.example apps/web/.env.local

# 4. run migrations
bun run migration:run

# 5. start api + web in parallel
bun run dev
#  api → http://localhost:4090/api (swagger: /api/docs)
#  web → http://localhost:3090
```

Default login (dev): `admin@admin.com / admin`.

### Prod deploy (CI)

On every push to `main`, `.github/workflows/deploy.yml` runs on the self-hosted Mac runner:

1. Checkout repo into existing working tree.
2. Assert `apps/api/.env.prod` and repo-root `.env` symlinks exist.
3. `docker compose -f docker-compose.prod.yml build`
4. `docker compose -f docker-compose.prod.yml up -d`
5. Poll `http://localhost:4090/api/health` up to 15 × 4 s.
6. Public smoke: `curl https://api.iamhusrev.com/api/health` (via Cloudflare Tunnel).

The `prod-deploy` concurrency group (`cancel-in-progress: false`) serialises deploys — a second push waits rather than cancelling.

### Manual fallback

```bash
bash scripts/deploy.sh            # full rebuild + restart
bash scripts/deploy.sh logs       # tail logs after deploy
bash scripts/deploy.sh --no-pull  # skip git pull (for runner use)
```

### Container build

- **API**: `apps/api/Dockerfile` — multi-stage Bun build → `dist/`. `docker-entrypoint.sh` runs `node dist/db/migrate.js run` then starts the server.
- **Web**: `apps/web/dockerfile` — `NEXT_PUBLIC_API_URL` injected as build arg; produces Next.js standalone output.

---

## 10. Operational concerns

### Backups

`scripts/pg-backup.sh` does a `pg_dump -Fc` and keeps 14 days. Dumps land in `~/Backup/husrevity-db-dumps/`, auto-synced to Google Drive Desktop.

| Job | Target DB | Schedule | LaunchAgent plist |
|---|---|---|---|
| dev | `husrevity_nest` (shared-infra) | daily 03:00 | `ops/com.husrev.husrevitybackup.plist` |
| prod | `husrevity_prod` (compose) | daily 04:00 | `ops/com.husrev.husrevitybackup-prod.plist` |

Install once: `cp ops/com.husrev.husrevitybackup*.plist ~/Library/LaunchAgents/ && launchctl load …`.

Restore: `pg_restore -h localhost -U postgres -d husrevity_nest_restore <dump>.dump`.

### Health endpoint

`GET /api/health` (`@Public`) — `apps/api/src/common/health.controller.ts`. Does a real DB ping (`SELECT 1`) with a 500 ms timeout. Returns `{ status: 'UP', db: 'UP' }` on 200 or 503 with `{ status: 'DOWN', db: 'DOWN' }` if the query times out or throws.

Set up an external monitor (UptimeRobot / BetterStack) checking `https://api.iamhusrev.com/api/health` for the string `"db":"UP"` every 3–5 minutes. See `ops/MONITORING.md`.

### Secret rotation rules (from `ops/SECRETS.md`)

| Secret | Rotatable? | Impact of rotation |
|---|---|---|
| `HUSREVITY_CRYPTO_KEY` | **No** (without re-encrypt migration) | All vault data permanently unreadable |
| `HUSREVITY_JWT_SECRET` | Yes | In-flight access tokens (~15 min) rejected; clients auto-refresh transparently |
| `VAPID_PRIVATE_KEY` | Yes, but destructive | All existing push subscriptions invalidated; users must re-opt-in |
| `HUSREVITY_DB_PASSWORD` | Yes | Must rotate in Postgres and in env simultaneously |
| `GOOGLE_CLIENT_SECRET` | Yes (via Google Cloud Console) | Gmail integration breaks until env updated |

### Prod-only env vars (not needed in dev)

- `HUSREVITY_INITIAL_ADMIN_EMAIL` + `HUSREVITY_INITIAL_ADMIN_PASSWORD_HASH` — consumed once by `RemoveDefaultAdmin` migration; delete afterwards.
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` — web-push; optional in dev (bell works without).
- `HUSREVITY_CORS_ORIGINS` — comma-separated allowed origins; defaults to `http://localhost:3001`.
- `NODE_ENV=production` — disables Swagger UI.

---

## 11. Known drift / open work

- **`apps/web/CLAUDE.md` is stale**: it references `npm` commands, port `8080`, a `NEXT_PUBLIC_API_URL=http://localhost:8080/api` default, a non-existent `useVehicles` hook pattern, and an `(admin)` route group that no longer exists. Trust the root `CLAUDE.md` for all conventions.

- **`eslint-plugin-react-hooks` missing**: pre-existing peer-dep warning in `apps/web`; does not affect builds or lint correctness in practice.

- **Calendar RRULE fan-out deferred**: `calendar_event.recurrence_rule` is stored but a single recurring event generates at most one `notification` row (the next occurrence). Per-occurrence fan-out is planned for Faz 5.

- **Plan/PlanItem and Project date fields**: `plan.target_date`, `plan_item.target_date`, `project.start_date`/`end_date` are date-only columns. They do not trigger notifications in V1.

- **No mailer**: there is no email-sending integration. All notifications are in-app bell + optional web-push.

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Evkat** | The daily time-blocking module/page (Turkish word for "time"). Distinct from `calendar_event`; blocks are intent-driven ("how do I spend this hour?"). Lives at `/evkat` and is backed by the `time_block` table. |
| **Husrev tokens** | The named design-system color/shadow values (`husrev-cream`, `husrev-amber`, `husrev-ember`, `husrev-moss`, `husrev-ink`, `husrev-sand`, `husrev-shadow`, `shadow-card-warm`). Defined in `apps/web/src/app/globals.css` and usable as Tailwind utilities. |
| **ResponseInterceptor envelope** | `{ success: boolean, message: string, code: number, data: T }` — the standard HTTP response shape emitted by `ResponseInterceptor` (success paths) and `GlobalExceptionFilter` (error paths). The web's `api-client.ts` and all hooks parse this shape. |
| **RequestContext** | An `AsyncLocalStorage<{ userId, email }>` entered by `JwtAuthGuard` on every authenticated request. `AuditSubscriber` reads it to populate `createdById`/`updatedById`; services call `getCurrentUserId()` when they need the caller's ID outside of a DI chain. |
| **AuditSubscriber** | A TypeORM `EntitySubscriberInterface` that fires `beforeInsert` and `beforeUpdate` for every `BaseEntity` subclass, setting `createdById`/`updatedById` from `RequestContext`. Registered in `typeorm.config.ts`. |
| **Vault** | The encrypted secrets store. `vault_entity` groups `vault_item` rows whose `value_enc` is AES-256-GCM ciphertext. The encryption key (`HUSREVITY_CRYPTO_KEY`) is immutable in production. |
| **syncNotification()** | Private method on `ReminderService`, `TaskService`, `ListService`, `CalendarService`, and `TimeBlockService`. Called after every create/update/toggle: cancels any prior undispatched notification for the source entity and re-enqueues at `dueAt - notifyMinutesBefore`. Pattern is identical across all five modules. |
| **Partial unique index** | Postgres `WHERE deleted_at IS NULL` unique index. Used by `notification` (`uq_notification_source_live`), `push_subscription` (`uq_push_subscription_endpoint_live`), and `gmail_account` (`uq_gmail_account_owner_email_provider`) to allow soft-deleted rows to be "resurrected" without colliding on the uniqueness constraint. |
| **Phase 1 / Phase 2** | The two development phases during which Spring Boot modules were ported to NestJS. Phase 1: auth, user, note, list, common, crypto. Phase 2: project, task, plan, calendar, reminder, vault, gmail. Both are fully shipped as of commit `0f549d1`. |
| **`HUSREVITY_CRYPTO_KEY`** | 32-byte base64 AES-256-GCM key. Encrypts vault item values and Gmail OAuth tokens. Immutable once prod data exists — there is no re-encrypt migration. Treat as irreplaceable. |

---

## 13. Entry points index

| To work on… | Start at… |
|---|---|
| Add a column to `reminder` | Create migration `AddXToReminder`, update `apps/api/src/reminder/reminder.entity.ts`, update DTO in `reminder/dto/reminder-dtos.ts`, update `ReminderService`, then mirror types/service/hook in `apps/web/src/`. |
| Add a new domain module | Follow the pattern of any existing module: `<domain>.module.ts` + controller + service + entity + `dto/`. Register in `apps/api/src/app.module.ts`. Don't forget `TypeOrmModule.forFeature([Entity])`. Import `NotificationModule` if the domain is time-sensitive. |
| Change the response envelope | `apps/api/src/common/response.interceptor.ts` and `apps/api/src/common/global-exception.filter.ts`. Mirror change in `apps/web/src/types/common/api-response.ts`. |
| Change auth behavior | `apps/api/src/auth/jwt.strategy.ts` (JWT parsing), `apps/api/src/auth/jwt-auth.guard.ts` (guard logic), `apps/api/src/auth/auth.service.ts` (token issuance). |
| Add a public endpoint | Add `@Public()` decorator from `apps/api/src/common/public.decorator.ts` to the handler. |
| Configure web push | Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in `apps/api/.env`. The rest is automatic. Generate keys: `bunx web-push generate-vapid-keys`. |
| Debug notification not firing | Check `notification` table: `dispatched_at IS NULL AND scheduled_at <= now()`. Check `push_subscription` table for the user. Check API logs for the `notification-dispatch` cron. |
| Add an i18n key | Add to both `apps/web/src/messages/en.json` and `apps/web/src/messages/tr.json` under the relevant namespace. |
| Change throttle limits | Global: `ThrottlerModule.forRoot` in `apps/api/src/app.module.ts`. Per-route: `@Throttle({ default: { limit: N, ttl: M } })` on the controller method. |
| First-time prod deploy | Follow `ops/PROD-RUNBOOK.md` in full, then `bash scripts/deploy.sh`. |
| Rotate JWT secret | Generate new value → update `~/.husrevity/api.env` → restart api container. See `ops/SECRETS.md`. |
| Rotate crypto key | Read `ops/SECRETS.md` first. There is no migration — rotation means vault data loss. |
| Add a design system component | Read existing utilities in `apps/web/src/app/globals.css`. Use `husrev-*` token names, `shadow-card-warm`, `grain`, and the animation helpers. Do not introduce new color values. |
