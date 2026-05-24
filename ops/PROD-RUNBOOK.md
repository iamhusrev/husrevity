# Production runbook — husrevity on a self-hosted Mac

> The authoritative human-side bring-up. Read [`SECURITY-CHECKLIST.md`](./SECURITY-CHECKLIST.md) in parallel — every `(blocker)` there must be ticked before LaunchAgents are loaded.

Architecture: Cloudflare Tunnel terminates TLS at the edge, hits 127.0.0.1 on this Mac. There is no Caddy, no nginx, no port-forward. The home static IP `85.104.115.220` is reserved for ops (SSH today, possible future mobile-API direct path).

```
Internet ──▶ Cloudflare Edge (TLS + WAF) ──▶ Tunnel "husrevity"
                                              ├─▶ 127.0.0.1:3090  web  (app.iamhusrev.com)
                                              └─▶ 127.0.0.1:4090  api  (api.iamhusrev.com) ──▶ postgres
```

---

## 1. Install toolchain (one-time)

```bash
brew install cloudflared jq gh gnupg
# Docker Desktop — download from https://docs.docker.com/desktop/mac/install/
# Enable "Start Docker Desktop when you log in" in Settings.
```

## 2. Cloudflare Tunnel — provision (one-time, interactive)

```bash
cloudflared tunnel login                                  # opens browser → pick iamhusrev.com zone
cloudflared tunnel create husrevity                       # creates tunnel, writes ~/.cloudflared/<UUID>.json
cloudflared tunnel route dns husrevity app.iamhusrev.com  # CNAME app.iamhusrev.com → <UUID>.cfargotunnel.com
cloudflared tunnel route dns husrevity api.iamhusrev.com  # CNAME api.iamhusrev.com → <UUID>.cfargotunnel.com

# Move credentials to a path the LaunchAgent reads (config.yml expects this path).
mkdir -p ~/.config/husrevity/cloudflared
mv ~/.cloudflared/*.json ~/.config/husrevity/cloudflared/credentials.json
chmod 600 ~/.config/husrevity/cloudflared/credentials.json
```

Verify:
```bash
cloudflared tunnel info husrevity        # expect 2-4 healthy connectors once the LaunchAgent is loaded
dig +short app.iamhusrev.com             # expect <UUID>.cfargotunnel.com chain
```

## 3. Secrets — fill `~/.husrevity/api.env`

```bash
mkdir -p ~/.husrevity ~/Library/Logs/iamhusrev ~/Backup/husrevity-prod-secrets

cp .env.production.example ~/.husrevity/api.env
chmod 600 ~/.husrevity/api.env
$EDITOR ~/.husrevity/api.env
```

Generate strong secrets and paste into the file (commands in the template too):

```bash
openssl rand -base64 48        # → HUSREVITY_JWT_SECRET (>= 32 bytes after b64-decode)
openssl rand -base64 32        # → HUSREVITY_CRYPTO_KEY (32 bytes — IMMUTABLE, do not rotate)
openssl rand -base64 24 | tr -d '/+=' | head -c 32   # → HUSREVITY_DB_PASSWORD
cd apps/api && bunx web-push generate-vapid-keys      # VAPID public/private — IMMUTABLE in prod
```

Symlink into the repo working tree:
```bash
cd "/Users/husrev/Projects (Personal)/husrevity"
ln -s ~/.husrevity/api.env apps/api/.env.prod   # mounted into api container as env_file
ln -s ~/.husrevity/api.env .env                 # docker compose ${VAR} interpolation
```

Off-machine copy (Drive-synced):
```bash
cp ~/.husrevity/api.env ~/Backup/husrevity-prod-secrets/api.env.copy
chmod 600 ~/Backup/husrevity-prod-secrets/api.env.copy
```

> ⚠️ Losing `HUSREVITY_CRYPTO_KEY` = vault data unrecoverable. See [`SECRETS.md`](./SECRETS.md).

## 4. First admin password

```bash
cd apps/api
bun scripts/hash-password.ts 'your-strong-prod-password'
# → bcrypt hash starting with $2b$10$...
```

Add to `~/.husrevity/api.env`:
```
HUSREVITY_INITIAL_ADMIN_EMAIL=iamhusrev@gmail.com
HUSREVITY_INITIAL_ADMIN_PASSWORD_HASH=$2b$10$....
```

The migration `1715000003000-RemoveDefaultAdmin` will swap the seeded `admin@admin.com / admin` for this on first deploy. After login, remove both lines.

## 5. LaunchAgents — install

```bash
cd "/Users/husrev/Projects (Personal)/husrevity"

# Cloudflare Tunnel (the new one)
ln -sfv "$(pwd)/ops/launchagents/com.iamhusrev.cloudflared.plist" ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.iamhusrev.cloudflared.plist

# Prod DB backup (already in repo)
ln -sfv "$(pwd)/ops/com.husrev.husrevitybackup-prod.plist" ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.husrev.husrevitybackup-prod.plist

# (Optional) Dev DB backup — only if you also want the shared-infra dev DB backed up
ln -sfv "$(pwd)/ops/com.husrev.husrevitybackup.plist" ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.husrev.husrevitybackup.plist

launchctl list | grep -E 'iamhusrev|husrevitybackup'
```

## 6. Power management — never sleep

```bash
sudo pmset -a sleep 0 disablesleep 1 hibernatemode 0 powernap 0 autorestart 1 tcpkeepalive 1
pmset -g | grep -E '^ +(sleep|disablesleep|autorestart) '
```

Enable **automatic login** in System Settings → Users & Groups (required so LaunchAgents start after reboot).

## 7. GitHub self-hosted runner

See [`RUNNER-SETUP.md`](./RUNNER-SETUP.md). Labels: `[self-hosted, macOS, iamhusrev-prod]`. Once registered and started, every push to `main` runs `.github/workflows/deploy.yml`.

## 8. First deploy

```bash
cd "/Users/husrev/Projects (Personal)/husrevity"
bash scripts/deploy.sh             # builds images and brings up the stack
docker compose -f docker-compose.prod.yml ps   # expect 3 services Up

# Smoke through the tunnel (publicly visible):
curl -fsS https://api.iamhusrev.com/api/health
curl -fsSI https://app.iamhusrev.com/ | head -1
```

## 9. Cloudflare edge hardening (dashboard)

After DNS is live, in Cloudflare dashboard → `iamhusrev.com`:

- SSL/TLS → **Full (strict)**
- Edge Certificates → HSTS on, max-age 31536000, includeSubDomains, preload
- Edge Certificates → Always Use HTTPS on
- Security → WAF → custom rule: `(http.host eq "api.iamhusrev.com" and starts_with(http.request.uri.path, "/api/auth/"))` → Rate limit 5/min/IP → Block
- Security → Bots → Bot Fight Mode on
- Email → Notifications → enable account access + billing alerts

## 10. Daily ops (after first deploy)

```bash
# Logs
docker compose -f docker-compose.prod.yml logs api --tail=100
docker compose -f docker-compose.prod.yml logs web --tail=100
tail -f ~/Library/Logs/iamhusrev/cloudflared.err.log

# Restart something
docker compose -f docker-compose.prod.yml restart api
launchctl kickstart -k gui/$(id -u)/com.iamhusrev.cloudflared

# Manual deploy (CI is preferred)
bash scripts/deploy.sh

# Manual backup / restore
bun run db:backup
bash ops/scripts/restore-db.sh latest    # restores into NEW db, doesn't auto-promote

# Rotate secrets
bash ops/scripts/rotate-secrets.sh jwt           # rotatable
bash ops/scripts/rotate-secrets.sh crypto-key    # will refuse (immutable)
```

## 11. Adding the next personal project to this Mac

Pattern: every project gets `<project>.iamhusrev.com` via the same tunnel.

1. Pick a port pair not yet used. **No defaults** — start at 4090/3090 + 10 per project (next would be 4100/3100, then 4110/3110, etc.).
2. Add ingress entry in `ops/cloudflared/config.yml`:
   ```yaml
     - hostname: <project>.iamhusrev.com
       service: http://127.0.0.1:<port>
   ```
3. `cloudflared tunnel route dns husrevity <project>.iamhusrev.com`
4. `launchctl kickstart -k gui/$(id -u)/com.iamhusrev.cloudflared` to reload the tunnel.
5. The new project's compose binds to `127.0.0.1:<port>`.
6. Same GitHub runner can serve multiple repos (just register each repo and the runner picks up jobs labeled `iamhusrev-prod`).

## 12. Disaster recovery

See [`SECRETS.md`](./SECRETS.md) "Recovery scenarios" and run `bash ops/scripts/restore-db.sh <date>` to restore from `~/Backup/husrevity-db-dumps/`.

- **Mac dies, crypto key + dumps lost** → vault data gone, everything else gone. Reseed empty.
- **Mac dies, crypto key in Drive backup, dumps in Drive** → restore Mac, reinstall toolchain, `cp` env back, `restore-db.sh latest`, redeploy. Tunnel reattaches automatically (DNS unchanged).
- **Suspect crypto key leaked** → see [`SECRETS.md`](./SECRETS.md). Rotation is destructive — there is no re-encrypt migration.
- **R2 / Drive outage during restore** → 30 days of local dumps are at `~/Backup/husrevity-db-dumps/` even if Drive is offline.
