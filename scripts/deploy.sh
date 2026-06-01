#!/usr/bin/env bash
#
# Manual deploy of husrevity prod stack. Used for:
#   - First deploy (before GH Actions runner is wired up)
#   - Fallback when the runner is broken
#   - Quick local rebuild after editing compose or cloudflared config
#
# Assumes:
#   - apps/api/.env.prod exists (symlink to ~/.husrevity/api.env recommended)
#   - .env at repo root exists for compose interpolation (same symlink target)
#   - Docker Desktop is running
#
# Usage:
#   bash scripts/deploy.sh           # full rebuild + restart
#   bash scripts/deploy.sh logs      # tail logs after deploy
#   bash scripts/deploy.sh --no-pull # skip git pull (useful in CI runner)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker-compose.yml"
PULL=true
TAIL_LOGS=false

for arg in "$@"; do
  case "$arg" in
    logs) TAIL_LOGS=true ;;
    --no-pull) PULL=false ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Safety: only deploy from a release/* branch. Prevents accidentally pushing
# dev or a feature branch to prod. Override with DEPLOY_ALLOW_ANY_BRANCH=1 if
# you really know what you're doing (hotfix from a one-off branch, etc).
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${DEPLOY_ALLOW_ANY_BRANCH:-0}" != "1" && ! "$CURRENT_BRANCH" =~ ^release/ ]]; then
  echo "[deploy] ERROR: refusing to deploy from non-release branch '$CURRENT_BRANCH'." >&2
  echo "[deploy]        Run:  git checkout release/1.0" >&2
  echo "[deploy]        Or override:  DEPLOY_ALLOW_ANY_BRANCH=1 bash scripts/deploy.sh" >&2
  exit 1
fi

echo "[deploy] starting at $(date)  (branch: $CURRENT_BRANCH)"

if [[ ! -f apps/api/.env.prod ]]; then
  echo "[deploy] ERROR: apps/api/.env.prod missing." >&2
  echo "[deploy]        Run: ln -s ~/.husrevity/api.env apps/api/.env.prod" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "[deploy] ERROR: repo root .env missing (needed for compose \${VAR} interpolation)." >&2
  echo "[deploy]        Run: ln -s ~/.husrevity/api.env .env" >&2
  exit 1
fi

if $PULL; then
  echo "[deploy] git pull..."
  git pull --ff-only
fi

echo "[deploy] building images..."
docker compose -f "$COMPOSE_FILE" build

echo "[deploy] starting stack (postgres → api → web)..."
docker compose -f "$COMPOSE_FILE" up -d

echo "[deploy] waiting for api health..."
sleep 8
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -m 3 http://localhost:4090/api/health > /dev/null 2>&1; then
    echo "[deploy] api healthy ✓"
    break
  fi
  echo "[deploy] api not ready yet (attempt $i/10), waiting 3s..."
  sleep 3
done

echo "[deploy] done at $(date)"

if $TAIL_LOGS; then
  echo "[deploy] tailing logs (Ctrl-C to exit)..."
  docker compose -f "$COMPOSE_FILE" logs -f --tail=50
fi
