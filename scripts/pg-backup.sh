#!/usr/bin/env bash
#
# pg_dump of a husrevity database (dev or prod) from a docker postgres
# container. Output goes to /Users/husrev/Backup/husrevity-db-dumps/, which is
# auto-synced to Google Drive Desktop.
#
# Defaults target the dev shared-infra container (HUSREVITY_BACKUP_CONTAINER=
# shared-postgres, HUSREVITY_DB_NAME=husrevity_nest, retention 14d).
# Prod LaunchAgent (ops/com.husrev.husrevitybackup-prod.plist) overrides these
# via EnvironmentVariables.

set -euo pipefail

CONTAINER="${HUSREVITY_BACKUP_CONTAINER:-shared-postgres}"
DB_NAME="${HUSREVITY_DB_NAME:-husrevity_nest}"
DB_USER="${HUSREVITY_DB_USER:-postgres}"
DEST_DIR="/Users/husrev/Backup/husrevity-db-dumps"
RETENTION_DAYS="${HUSREVITY_BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$DEST_DIR"

if ! /usr/local/bin/docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER" \
   && ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
  echo "[pg-backup] $CONTAINER is not running — skipping" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M)
OUT="$DEST_DIR/${DB_NAME}-${STAMP}.dump"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$OUT"

SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null || echo "?")
echo "[pg-backup] wrote $OUT (${SIZE} bytes)"

find "$DEST_DIR" -name "${DB_NAME}-*.dump" -mtime "+${RETENTION_DAYS}" -delete -print \
  | sed 's/^/[pg-backup] pruned /'

echo "[pg-backup] done"
