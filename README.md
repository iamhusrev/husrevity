# husrevity

Personal productivity monorepo — **NestJS** API + **Next.js** web, Bun workspaces. One `bun run dev` boots both.

`apps/api` began as a **port of [`husrevity-api`](../husrevity-api)** (Spring Boot) into NestJS. The **NestJS API is now the source of truth** and `apps/web` is synced to its contract; Spring is historical context only and cross-backend parity is no longer maintained.

> Status: **Phase 1 + Phase 2 shipped + cross-cutting Notifications + Evkat module.** All Spring modules (auth, user, note, list, project, task, plan, calendar, reminder, vault, gmail, crypto) have NestJS counterparts; on top of that a central `notification` module (web-push via VAPID + per-minute cron + bell dropdown) wires every scheduled entity into one queue, and the new `time-block` module backs the **Evkat** daily hour-stack planner at `/evkat`.

## Stack

|                   | Dev                                                         | Prod                          |
| ----------------- | ----------------------------------------------------------- | ----------------------------- |
| Runtime / pkg mgr | Bun 1.3+ (workspaces)                                       | Bun 1.3 in Docker             |
| API               | NestJS 10 + TypeORM 0.3                                     | same, fronted by Cloudflare Tunnel |
| Web               | Next.js 15 + React 19 + Tailwind 4 + TanStack Query         | Next.js standalone build      |
| DB                | Postgres 16 (shared-infra container `:5432`)                | Postgres 16 (compose service) |
| Auth              | JWT 15-min access + opaque 30-day refresh (SHA-256 at rest) | same                          |
| Push              | Web Push (VAPID) + `/sw.js`; `@nestjs/schedule` cron        | same                          |
| TLS / proxy       | — (direct localhost)                                        | Cloudflare Tunnel (TLS at edge, no open ports) |
| Orchestration     | `concurrently`                                              | `docker compose`              |

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
bun run db:backup           # manual pg_dump
```

API-only (from `apps/api/`): `bun run migration:revert`, `bun run migration:show`.
Web lint (from `apps/web/`): `bun run lint`.

---

## Prod — deployment

Prod runs the stack as Docker containers on a **self-hosted Mac** at home, with **Cloudflare Tunnel** as ingress (no open inbound ports on the home network):

```
Internet ──▶ Cloudflare Edge (TLS + WAF) ──▶ Tunnel "husrevity"
                                              ├─▶ 127.0.0.1:3090  web  (app.iamhusrev.com)
                                              └─▶ 127.0.0.1:4090  api  (api.iamhusrev.com) ──▶ postgres
```

The static public IP `85.104.115.220` is reserved for ops (SSH today, future mobile API direct path). Web traffic flows through the Tunnel so the home IP stays hidden.

`docker-compose.prod.yml` boots in order: **postgres → api → web**. The api container runs DB migrations on startup via `docker-entrypoint.sh` before serving. `cloudflared` runs natively as a LaunchAgent (not a compose service) so it survives Docker Desktop restarts.

### First-time deploy (one-time human steps)

Follow [`ops/PROD-RUNBOOK.md`](./ops/PROD-RUNBOOK.md) — it's the authoritative runbook. High level:

1. `brew install cloudflared jq gh gnupg` (plus Docker Desktop installer).
2. **Cloudflare Tunnel** — `cloudflared tunnel login` → `tunnel create husrevity` → `tunnel route dns husrevity {app,api}.iamhusrev.com`. Move credentials to `~/.config/husrevity/cloudflared/credentials.json` (mode 600).
3. **Secrets** — fill `~/.husrevity/api.env` (chmod 600) from `apps/api/.env.prod.example`, generate strong secrets, then symlink:
   ```bash
   ln -s ~/.husrevity/api.env apps/api/.env.prod   # mounted into api container
   ln -s ~/.husrevity/api.env .env                 # docker compose ${VAR} interpolation
   ```
4. **LaunchAgents** — install `ops/launchagents/com.iamhusrev.cloudflared.plist` and `ops/com.husrev.husrevitybackup-prod.plist`. `sudo pmset -a sleep 0 disablesleep 1`.
5. **Off-machine secrets backup** — copy `api.env` into the Drive-synced backup folder. ⚠️ Losing `HUSREVITY_CRYPTO_KEY` = all vault data unrecoverable. See [`ops/SECRETS.md`](./ops/SECRETS.md) and [`ops/SECURITY-CHECKLIST.md`](./ops/SECURITY-CHECKLIST.md).

Then run the first deploy manually:

```bash
bash scripts/deploy.sh          # full build + restart (~5 min first time)
bash scripts/deploy.sh logs     # tail logs after deploy
```

### First admin user (prod)

Migration `1715000003000-RemoveDefaultAdmin` replaces the `admin@admin.com` seed with a real admin from env vars, then deletes the default (it **throws** if the default exists and the env vars are missing — by design, to prevent silent lockout). Before first deploy:

```bash
cd apps/api && bun scripts/hash-password.ts 'your-strong-password'
# put output in HUSREVITY_INITIAL_ADMIN_PASSWORD_HASH (and set _EMAIL) in ~/.husrevity/api.env
# after a successful login, remove both HUSREVITY_INITIAL_ADMIN_* lines
```

Full secret rotation/recovery playbook: [`ops/SECRETS.md`](./ops/SECRETS.md).

### Continuous deploy (after first deploy)

A GitHub Actions **self-hosted runner on the prod Mac** redeploys on every push to `main` (`.github/workflows/deploy.yml`): build images → `compose up -d` → wait for `/api/health` → public HTTPS smoke test. One-time runner setup: [`ops/RUNNER-SETUP.md`](./ops/RUNNER-SETUP.md). Rollback = revert the PR and push; the `prod-deploy` concurrency group serializes deploys.

Manual fallback any time: `bash scripts/deploy.sh`.

### Monitoring

Health endpoint does a real DB ping (`GET /api/health` → `{ status, db }`, 503 if DB down). Set up free uptime monitors and verify the backup-restore chain in week 1 — see [`ops/MONITORING.md`](./ops/MONITORING.md).

---

## Backups

`scripts/pg-backup.sh` runs `pg_dump -Fc` into `/Users/husrev/Backup/husrevity-db-dumps/` (auto-synced to Google Drive Desktop). Two LaunchAgents:

| Job  | DB                              | Schedule    | Plist                                       |
| ---- | ------------------------------- | ----------- | ------------------------------------------- |
| dev  | `husrevity_nest` (shared-infra) | daily 03:00 | `ops/com.husrev.husrevitybackup.plist`      |
| prod | `husrevity_prod` (compose)      | daily 04:00 | `ops/com.husrev.husrevitybackup-prod.plist` |

```bash
# install (one-time)
cp ops/com.husrev.husrevitybackup*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.husrev.husrevitybackup.plist
launchctl load ~/Library/LaunchAgents/com.husrev.husrevitybackup-prod.plist

# manual dev backup
bun run db:backup

# restore a dump
pg_restore -h localhost -U postgres -d husrevity_nest_restore <dump>.dump
```

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
│   │   ├── scripts/hash-password.ts
│   │   ├── Dockerfile              # bun build → runs migrations on boot
│   │   └── .env.prod.example
│   └── web/                        # Next.js (forked from husrevity-web)
│       ├── public/sw.js            # minimal Web Push service worker
│       ├── src/app/(app)/evkat/    # Evkat daily hour-stack page (/evkat)
│       └── dockerfile              # Next.js standalone, monorepo-aware
├── packages/                       # reserved for shared-types (empty)
├── docs/
│   └── PROJECT-STRUCTURE.md        # end-to-end architecture walkthrough (start here)
├── scripts/
│   ├── pg-backup.sh                # dev/prod parametric pg_dump
│   └── deploy.sh                   # manual prod deploy
├── ops/                            # prod runbooks: PROD-RUNBOOK, SECURITY-CHECKLIST, RUNNER-SETUP,
│                                   #   SECRETS, MONITORING + cloudflared/ + launchagents/ + scripts/
├── .github/workflows/deploy.yml    # self-hosted-runner CD
└── docker-compose.prod.yml         # postgres → api → web
```

See [`docs/PROJECT-STRUCTURE.md`](./docs/PROJECT-STRUCTURE.md) for the end-to-end architecture walkthrough (request lifecycle, module-by-module catalogue, frontend mirror, deploy topology). [`CLAUDE.md`](./CLAUDE.md) is the short-form conventions reference (response envelope, soft-delete, audit, multi-tenancy).
