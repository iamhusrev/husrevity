#!/usr/bin/env bash
#
# Interactive secret rotation runbook for husrevity.
#
# Rotatable:   HUSREVITY_JWT_SECRET, HUSREVITY_DB_PASSWORD
# IMMUTABLE:   HUSREVITY_CRYPTO_KEY (vault data loss), VAPID_PRIVATE_KEY (push subscriptions void)
#
# Usage:
#   bash ops/scripts/rotate-secrets.sh jwt
#   bash ops/scripts/rotate-secrets.sh crypto-key   # will refuse
#   bash ops/scripts/rotate-secrets.sh vapid        # will refuse
#
# See ops/SECRETS.md for the full impact matrix.

set -euo pipefail

ENV_FILE="${HUSREVITY_ENV_FILE:-$HOME/.husrevity/api.env}"

if [[ $# -lt 1 ]]; then
  cat <<USAGE
usage: $0 <jwt | crypto-key | vapid | db-password>

  jwt           Generate a new HUSREVITY_JWT_SECRET. Access tokens issued
                before restart fail signature verification; web clients
                auto-refresh transparently. Refresh tokens are unaffected.

  db-password   Rotate Postgres user password (DB-side and env-side together).
                Brief connection drops during container restart.

  crypto-key    REFUSED. HUSREVITY_CRYPTO_KEY is immutable — rotation =
                vault data loss. There is no re-encrypt migration.

  vapid         REFUSED. Rotating VAPID_PRIVATE_KEY invalidates every device
                subscription; users must re-enable notifications.

USAGE
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found at $ENV_FILE" >&2
  echo "Set HUSREVITY_ENV_FILE if it lives elsewhere." >&2
  exit 1
fi

confirm() {
  local prompt="$1"
  read -r -p "$prompt [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

backup_env() {
  local stamp
  stamp="$(date +%Y%m%d_%H%M%S)"
  cp "$ENV_FILE" "${ENV_FILE}.bak.${stamp}"
  echo "[rotate] env backed up to ${ENV_FILE}.bak.${stamp}"
}

replace_env_var() {
  local key="$1"
  local value="$2"
  # POSIX sed in-place — keep ordering and comments intact.
  if grep -q "^${key}=" "$ENV_FILE"; then
    # use a sentinel char unlikely to be in base64 output
    sed -i.tmp "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.tmp"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

restart_api() {
  echo "[rotate] restarting api container so it picks up the new env..."
  (cd "$(dirname "$0")/../.." && \
    docker compose -f docker-compose.prod.yml restart api)
}

case "$1" in
  jwt)
    echo "[rotate] HUSREVITY_JWT_SECRET — refresh tokens preserved, access tokens invalidate."
    confirm "Proceed?" || { echo "aborted"; exit 0; }
    backup_env
    new="$(openssl rand -base64 48)"
    replace_env_var "HUSREVITY_JWT_SECRET" "$new"
    restart_api
    echo "[rotate] done. Users may see one redirect; no re-login prompt."
    ;;

  db-password)
    echo "[rotate] HUSREVITY_DB_PASSWORD — Postgres and env updated together."
    confirm "Proceed?" || { echo "aborted"; exit 0; }
    backup_env
    new="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
    # update Postgres first; if env update fails we still know the new pw
    docker exec husrevity-prod-postgres psql -U postgres -c \
      "ALTER USER postgres PASSWORD '$new';"
    replace_env_var "HUSREVITY_DB_PASSWORD" "$new"
    restart_api
    echo "[rotate] done."
    ;;

  crypto-key)
    cat <<'BLOCKED' >&2
[rotate] REFUSED — HUSREVITY_CRYPTO_KEY is IMMUTABLE.

Rotation means every existing vault entry becomes undecryptable (the format is
base64(IV || ciphertext || tag) with no key id, no fallback). There is no
re-encrypt migration in this codebase.

If you truly need to rotate (suspect leak), you must:
  1. Export every vault item to a safe channel (manual copy by the user).
  2. Generate a new key.
  3. Wipe vault_item / vault_entity rows.
  4. Have the user re-enter the data.

See ops/SECRETS.md "HUSREVITY_CRYPTO_KEY — IMMUTABLE in production".
BLOCKED
    exit 1
    ;;

  vapid)
    cat <<'BLOCKED' >&2
[rotate] REFUSED — VAPID_PRIVATE_KEY is IMMUTABLE in production.

The browser binds each push subscription to the public key it was registered
with. Rotating means every device's subscription becomes orphaned (no error
shown to the user — pushes just silently never arrive) until they re-enable
notifications via the settings page.

If a leak is real and re-onboarding every device is acceptable:
  1. Generate: bunx web-push generate-vapid-keys
  2. Update VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in env.
  3. Restart api.
  4. Send a broadcast notice asking users to re-enable notifications.
BLOCKED
    exit 1
    ;;

  *)
    echo "Unknown secret: $1" >&2
    exit 2
    ;;
esac
