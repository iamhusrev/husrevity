#!/usr/bin/env bash
#
# Manual deploy of husrevity stack — prod or staging. Used for:
#   - First deploy (before GH Actions runner is wired up)
#   - Fallback when the runner is broken
#   - Quick local rebuild after editing compose or cloudflared config
#
# Usage:
#   bash scripts/deploy.sh prod           # full rebuild + restart of prod stack
#   bash scripts/deploy.sh staging        # full rebuild + restart of staging stack
#   bash scripts/deploy.sh prod logs      # tail logs after deploy
#   bash scripts/deploy.sh staging --no-pull
#
# Overrides:
#   DEPLOY_ALLOW_ANY_BRANCH=1     skip the branch safety guard

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TARGET=""
PULL=true
TAIL_LOGS=false

for arg in "$@"; do
  case "$arg" in
    prod|staging) TARGET="$arg" ;;
    logs)         TAIL_LOGS=true ;;
    --no-pull)    PULL=false ;;
    *)            echo "Unknown arg: $arg" >&2
                  echo "Usage: bash scripts/deploy.sh prod|staging [logs] [--no-pull]" >&2
                  exit 2 ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "[deploy] ERROR: missing target (prod|staging)." >&2
  echo "[deploy]        Usage: bash scripts/deploy.sh prod|staging [logs] [--no-pull]" >&2
  exit 2
fi

# Per-target configuration. The env vars on the right-hand side are read by
# docker-compose.yml at parse time.
case "$TARGET" in
  prod)
    EXPECTED_BRANCH="master"
    SECRETS_FILE="$HOME/.husrevity/api.env"
    PUBLIC_HEALTH_URL="https://api.iamhusrev.com/api/health"
    export STACK_NAME="husrevity-prod"
    export HUSREVITY_API_HOST_PORT="4090"
    export HUSREVITY_WEB_HOST_PORT="3090"
    export HUSREVITY_DB_HOST_PORT="5490"
    export NEXT_PUBLIC_API_URL="https://api.iamhusrev.com/api"
    ;;
  staging)
    EXPECTED_BRANCH="dev"
    SECRETS_FILE="$HOME/.husrevity/api.staging.env"
    PUBLIC_HEALTH_URL="https://staging-api.iamhusrev.com/api/health"
    export STACK_NAME="husrevity-staging"
    export HUSREVITY_API_HOST_PORT="4091"
    export HUSREVITY_WEB_HOST_PORT="3091"
    export HUSREVITY_DB_HOST_PORT="5491"
    export NEXT_PUBLIC_API_URL="https://staging-api.iamhusrev.com/api"
    ;;
esac

# Safety: deploying prod from anything but master, or staging from anything
# but dev, is almost certainly a mistake. Override via DEPLOY_ALLOW_ANY_BRANCH=1.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${DEPLOY_ALLOW_ANY_BRANCH:-0}" != "1" && "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "[deploy] ERROR: refusing to deploy '$TARGET' from branch '$CURRENT_BRANCH' (expected '$EXPECTED_BRANCH')." >&2
  echo "[deploy]        Run:  git checkout $EXPECTED_BRANCH" >&2
  echo "[deploy]        Or override:  DEPLOY_ALLOW_ANY_BRANCH=1 bash scripts/deploy.sh $TARGET" >&2
  exit 1
fi

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "[deploy] ERROR: secrets file missing: $SECRETS_FILE" >&2
  echo "[deploy]        See ~/iamhusrev-prod/RUNBOOK.md for how to provision it." >&2
  exit 1
fi

# Point both env handles at the right canonical file.
ln -sfn "$SECRETS_FILE" apps/api/.env.prod
ln -sfn "$SECRETS_FILE" .env

echo "[deploy] starting at $(date)  (target: $TARGET, branch: $CURRENT_BRANCH, stack: $STACK_NAME)"

if $PULL; then
  echo "[deploy] git pull..."
  git pull --ff-only
fi

echo "[deploy] building images..."
docker compose build

echo "[deploy] starting stack (postgres → api → web)..."
docker compose up -d

echo "[deploy] waiting for api health on localhost:${HUSREVITY_API_HOST_PORT}..."
sleep 8
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -m 3 "http://localhost:${HUSREVITY_API_HOST_PORT}/api/health" > /dev/null 2>&1; then
    echo "[deploy] api healthy ✓"
    break
  fi
  echo "[deploy] api not ready yet (attempt $i/10), waiting 3s..."
  sleep 3
done

echo "[deploy] public smoke: $PUBLIC_HEALTH_URL"
if curl -fsS -m 8 --retry 3 --retry-delay 3 --retry-connrefused "$PUBLIC_HEALTH_URL" > /dev/null; then
  echo "[deploy] public health ✓"
else
  echo "[deploy] WARNING: public smoke failed — check cloudflared ingress for $TARGET." >&2
fi

echo "[deploy] done at $(date)"

if $TAIL_LOGS; then
  echo "[deploy] tailing logs (Ctrl-C to exit)..."
  docker compose logs -f --tail=50
fi
