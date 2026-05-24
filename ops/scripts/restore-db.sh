#!/usr/bin/env bash
#
# Restore a husrevity_prod backup into a NEW database — never auto-overwrite
# production. Prints rename commands at the end for human review.
#
# Usage:
#   bash ops/scripts/restore-db.sh 2026-05-24            # picks the dump for that date
#   bash ops/scripts/restore-db.sh latest                # picks the newest dump
#   bash ops/scripts/restore-db.sh /path/to/foo.dump     # explicit path
#
# Source layout: scripts/pg-backup.sh writes
#   ~/Backup/husrevity-db-dumps/husrevity_prod-<YYYY-MM-DD>-<HHmm>.dump
# (Drive-synced; Drive re-downloads on demand if you free up local space.)

set -euo pipefail

BACKUP_DIR="${HUSREVITY_BACKUP_DIR:-$HOME/Backup/husrevity-db-dumps}"
CONTAINER="${HUSREVITY_BACKUP_CONTAINER:-husrevity-prod-postgres}"
DB_USER="${HUSREVITY_DB_USER:-postgres}"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <YYYY-MM-DD | latest | /path/to/dump>" >&2
  exit 2
fi
arg="$1"

if [[ -f "$arg" ]]; then
  dump="$arg"
elif [[ "$arg" == "latest" ]]; then
  dump="$(ls -t "$BACKUP_DIR"/husrevity_prod-*.dump 2>/dev/null | head -1)"
  if [[ -z "$dump" ]]; then
    echo "No dump found in $BACKUP_DIR" >&2
    exit 1
  fi
else
  # date-pattern match (any time-of-day for that date)
  dump="$(ls -t "$BACKUP_DIR"/husrevity_prod-"$arg"-*.dump 2>/dev/null | head -1)"
  if [[ -z "$dump" ]]; then
    echo "No dump found for date $arg in $BACKUP_DIR" >&2
    echo "Available:" >&2
    ls -1 "$BACKUP_DIR"/husrevity_prod-*.dump 2>/dev/null | tail -10 | sed 's/^/  /' >&2
    exit 1
  fi
fi

target_db="husrevity_restore_$(date +%Y%m%d_%H%M%S)"
echo "[restore] source dump: $dump"
echo "[restore] target db:   $target_db (NEW — production is untouched)"

# 1. ensure container is up
if ! docker exec "$CONTAINER" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
  echo "[restore] ERROR: container '$CONTAINER' not ready. Is the stack running?" >&2
  exit 1
fi

# 2. create the target db
echo "[restore] creating target db..."
docker exec "$CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE \"$target_db\";"

# 3. stream the dump into pg_restore (avoids materialising the file inside the container)
echo "[restore] pg_restore streaming..."
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$target_db" < "$dump"

# 4. sanity row counts
echo "[restore] sanity check (top-3 tables):"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$target_db" -c "
  SELECT 'app_user' AS t, count(*) FROM app_user UNION ALL
  SELECT 'note',       count(*) FROM note       UNION ALL
  SELECT 'task',       count(*) FROM task;" 2>/dev/null || true

cat <<EOF

[restore] DONE — data is in '$target_db'.

To promote it to production (DESTRUCTIVE — review row counts first):

  docker exec -it $CONTAINER psql -U $DB_USER -c \\
    "ALTER DATABASE husrevity_prod RENAME TO husrevity_prod_pre_restore;"
  docker exec -it $CONTAINER psql -U $DB_USER -c \\
    "ALTER DATABASE \"$target_db\" RENAME TO husrevity_prod;"

Then restart the api so it reconnects:
  docker compose -f docker-compose.prod.yml restart api

If something looks wrong, drop the restore db instead:
  docker exec -it $CONTAINER psql -U $DB_USER -c "DROP DATABASE \"$target_db\";"
EOF
