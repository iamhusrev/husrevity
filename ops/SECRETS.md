# Secrets — production playbook

This file documents how the husrevity production secrets behave under rotation, loss, and recovery scenarios. **Read it before touching any secret in production.**

## Critical secrets at a glance

| Env var                                            | What it does                                           | Rotatable?                                                 | Loss impact                                                     |
| -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `HUSREVITY_CRYPTO_KEY`                             | AES-256-GCM key for vault entries + Gmail OAuth tokens | **NO** (without re-encrypt migration)                      | All vault data permanently unreadable                           |
| `HUSREVITY_JWT_SECRET`                             | Signs access tokens                                    | Yes — invalidates in-flight access tokens (≤15 min impact) | All sessions reject until refresh; users re-login transparently |
| `HUSREVITY_INITIAL_ADMIN_EMAIL` / `_PASSWORD_HASH` | First-deploy admin seed                                | One-time use                                               | n/a — only consulted by `RemoveDefaultAdmin` migration          |
| `HUSREVITY_DB_PASSWORD`                            | Postgres user password                                 | Yes (rotate in DB and in env together)                     | Connection refused until env updated                            |
| `GOOGLE_CLIENT_SECRET`                             | Gmail OAuth client                                     | Yes via Google Cloud Console                               | Gmail integration breaks until rotated everywhere               |

## `HUSREVITY_CRYPTO_KEY` — IMMUTABLE in production

Vault items are encrypted with this key (`apps/api/src/crypto/crypto.service.ts`). The format is `base64(IV || ciphertext || tag)` — no key id, no fallback. **Rotating the key means every vault row becomes undecryptable.** There is currently no re-encrypt migration.

Rules:

- Generate **once**, before first deploy: `openssl rand -base64 32`
- Store in `~/.husrevity/api.env` (chmod 600) on the prod host.
- Keep a second copy in `~/Backup/husrevity-prod-secrets/` (Drive-synced, off-machine).
- Optional belt-and-braces: print the base64 string, put it in your password manager.
- **Never commit it. Never log it. Never paste it in chat.**

If you ever rotate it, treat all existing vault entries as lost and re-enter them.

## `HUSREVITY_JWT_SECRET` — rotatable

Signs access tokens (15 min TTL). Refresh tokens are **opaque random bytes**, SHA-256 hashed at rest in the `refresh_token` table — they are **not** affected by JWT secret rotation. Rotating the JWT secret:

1. Generate new: `openssl rand -base64 48`
2. Update `~/.husrevity/api.env`
3. Restart the api container
4. All access tokens issued before restart will fail signature verification → web client auto-refreshes (using the still-valid refresh token) → fresh access token signed with new secret. Users see ~one redirect, no re-login prompt.

## First-deploy admin seed

On a fresh prod database the migrations seed `admin@admin.com / admin` (Spring parity, `apps/api/src/db/migrations/1715000001000-SeedAdmin.ts`). The follow-up migration `1715000003000-RemoveDefaultAdmin.ts` replaces it with a real admin built from env vars, then deletes the default. The migration **throws if the default still exists and the env vars are missing** — by design, to prevent a silent lockout where the migration runs as a no-op and you can't log in.

Workflow for first deploy:

```bash
# 1. Generate bcrypt hash of your admin password (run on the prod host, not in a remote shell)
cd apps/api && bun scripts/hash-password.ts 'your-strong-password-here'
# → outputs: $2b$10$....................

# 2. Add to ~/.husrevity/api.env
HUSREVITY_INITIAL_ADMIN_EMAIL=iamhusrev@gmail.com
HUSREVITY_INITIAL_ADMIN_PASSWORD_HASH=$2b$10$....................

# 3. Run docker compose up — entrypoint will run migrations including RemoveDefaultAdmin
# 4. Verify login at https://app.iamhusrev.com works with the new credentials
# 5. Remove the two HUSREVITY_INITIAL_ADMIN_* lines from ~/.husrevity/api.env
#    (they are not needed after the migration runs once)
```

## File location and permissions

```bash
~/.husrevity/api.env          # chmod 600, owner = you
~/Backup/husrevity-prod-secrets/api.env.copy   # second copy, drive-synced
```

The api compose service references `~/.husrevity/api.env` via `env_file:` (absolute path). The secrets are never in the repo, never in the docker image.

## Recovery scenarios

- **Mac dies, vault key lost** → no recovery, vault data is gone. Reseed empty.
- **Mac dies, vault key in Backup folder** → restore Mac, copy api.env back, restore latest pg dump from `~/Backup/husrevity-db-dumps/`. Vault decrypts as before.
- **Forgot admin password** → SSH to the prod host, run `bun scripts/hash-password.ts 'newpw'`, `UPDATE app_user SET password_hash = '$2b$...' WHERE email = 'iamhusrev@gmail.com';` against the prod DB.
- **Suspect JWT secret leaked** → rotate per "rotatable" section above. Refresh tokens persist; users stay logged in via auto-refresh.
- **Suspect crypto key leaked** → harder. Vault data is exposed retroactively to whoever has the key. Rotation without re-encrypt = data loss; the practical move is rotate the key, accept vault wipe, manually re-enter sensitive entries.
