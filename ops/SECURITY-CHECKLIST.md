# Pre-go-live security checklist

Walk this top-to-bottom **before** loading the production LaunchAgents. Items marked `(blocker)` must be ticked; `(deferred)` items should have an open ticket. KVKK applies (real user data on Turkish soil).

---

## A. Default admin

- [ ] **(blocker)** First deploy populated `HUSREVITY_INITIAL_ADMIN_EMAIL` + `HUSREVITY_INITIAL_ADMIN_PASSWORD_HASH` in `~/.husrevity/api.env`.
- [ ] **(blocker)** Migration `1715000003000-RemoveDefaultAdmin` ran successfully (api boot log shows it; logging in as `admin@admin.com / admin` is now denied).
- [ ] **(blocker)** `HUSREVITY_INITIAL_ADMIN_*` lines removed from `~/.husrevity/api.env` after first successful login as the real admin.

## B. Secrets at rest

- [ ] **(blocker)** `~/.husrevity/api.env` has mode `600`, owner `husrev`. `stat -f '%Lp %Su' ~/.husrevity/api.env` → `600 husrev`.
- [ ] **(blocker)** `~/.config/husrevity/cloudflared/credentials.json` has mode `600`.
- [ ] **(blocker)** Off-machine copy of `api.env` lives at `~/Backup/husrevity-prod-secrets/` (Drive-synced). Confirms `HUSREVITY_CRYPTO_KEY` survives a wiped Mac.
- [ ] **(blocker)** `HUSREVITY_JWT_SECRET` ≥ 32 bytes after base64-decode (`openssl rand -base64 48`).
- [ ] **(blocker)** `HUSREVITY_CRYPTO_KEY` = base64 of exactly 32 bytes (`openssl rand -base64 32`). **Never rotated** — see [`SECRETS.md`](./SECRETS.md).
- [ ] FileVault enabled (`fdesetup status`). At-rest encryption for postgres data volume and dump files.

## C. Network exposure

- [ ] **(blocker)** No port-forward on the modem for HTTP/HTTPS. Cloudflare Tunnel is the only ingress.
- [ ] **(blocker)** Compose `api` and `web` ports bind to `127.0.0.1` only — verify `lsof -iTCP -sTCP:LISTEN | grep -E '(3090|4090)'` shows loopback addresses, not `*`.
- [ ] Static IP `85.104.115.220` does NOT respond on `:80` or `:443` from outside (`curl -m 5 -fsS http://85.104.115.220/` should refuse/timeout).
- [ ] If SSH on the static IP is enabled, key-based auth only (no passwords).

## D. Authentication & JWT

- [ ] Access token TTL 15 min, refresh token TTL 30 days (defaults — verify `~/.husrevity/api.env` doesn't override).
- [ ] **(deferred)** Move web JWT storage from `localStorage` to httpOnly cookie. Open ticket: XSS hardening.
- [ ] Throttler caps `/api/auth/*` at 5 req/min/IP at the edge (Cloudflare WAF) and 100 req/min app-wide (NestJS `@nestjs/throttler`).

## E. Database

- [ ] `HUSREVITY_DB_PASSWORD` rotated from any value that touched git or chat. Use `ops/scripts/rotate-secrets.sh db-password` if unsure.
- [ ] DB role used by api is **not** a Postgres superuser (deferred — current compose uses `postgres` superuser for simplicity; tighten when shared-infra is migrated).
- [ ] `pg_isready` healthcheck wired in compose so api waits for DB.

## F. macOS hardening

- [ ] **(blocker)** `pmset -a sleep 0 disablesleep 1 hibernatemode 0 powernap 0 autorestart 1` — verify with `pmset -g | grep -E '^ +(sleep|disablesleep|autorestart) '`.
- [ ] **(blocker)** macOS automatic login on (System Settings → Users & Groups). Required for LaunchAgents to start after reboot.
- [ ] FileVault enabled.
- [ ] Built-in firewall ON (System Settings → Network → Firewall) — incoming connections blocked.

## G. Cloudflare edge

- [ ] **(blocker)** SSL/TLS mode = **Full (strict)** (Cloudflare dashboard → SSL/TLS).
- [ ] HSTS preload on (max-age=31536000, includeSubDomains, preload).
- [ ] Always Use HTTPS on.
- [ ] Bot Fight Mode on (free tier).
- [ ] WAF rate-limit rule: `/api/auth/*` → 5 requests/min per IP.
- [ ] Account-level email alerts (login from new IP, billing changes) enabled.

## H. Backup

- [ ] **(blocker)** `ops/com.husrev.husrevitybackup-prod.plist` loaded (`launchctl list | grep husrevitybackup-prod`).
- [ ] First manual backup tested: `bun run db:backup` → file appears under `~/Backup/husrevity-db-dumps/` and Drive shows it as synced.
- [ ] **(blocker)** Restore tested end-to-end via `bash ops/scripts/restore-db.sh latest` — row counts match prod.
- [ ] Retention: 30 days local (handled by `pg-backup.sh`).

## I. CI/CD

- [ ] Self-hosted GitHub runner registered with labels `[self-hosted, macOS, iamhusrev-prod]`.
- [ ] Runner installed as launchd service (`./svc.sh install && ./svc.sh start`).
- [ ] Symlinks present in runner's `_work/<repo>/<repo>` checkout dir: `.env` and `apps/api/.env.prod` → `~/.husrevity/api.env`.
- [ ] First successful deploy from a push to `main` end-to-end.

## J. KVKK / data

- [ ] Backup dump files encrypted at rest via FileVault (Drive copy too — Drive Desktop encrypts in transit + at rest at Google).
- [ ] Real user data NEVER copied to dev DB (`husrevity_nest`) or any staging environment.
- [ ] **(deferred)** 30-day hard-delete cron for soft-deleted users. Open ticket.
- [ ] **(deferred)** Vault payload encryption audit — confirm `vault_item` payloads use AES-GCM via `crypto.service.ts`.
- [ ] **(deferred)** DPIA document for the Vault module. Open ticket.

## K. Monitoring

- [ ] UptimeRobot or BetterStack: two monitors (api/health, web/) configured.
- [ ] Discord webhook (`WEBHOOK_URL`) tested with `ops/scripts/notify.sh OK test "hello"`.

---

## Sign-off

I have walked this checklist top to bottom and every `(blocker)` is ticked. Deferred items have open tickets.

- Date: __________
- Reviewer: __________
