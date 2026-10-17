#!/bin/bash
# End-to-end proof that the Swift package and the NestJS API fit together.
#
#   apps/macos/scripts/e2e.sh
#
# Everything is disposable and local:
#   1. a throw-away postgres:16-alpine container on a random host port (no volumes, --rm),
#   2. the API migrations applied to it, then the API started from source on a random free port,
#      with freshly generated secrets passed only as process environment variables,
#   3. one user registered through POST /api/auth/register and a little data seeded for the smoke,
#   4. `swift test --filter HusrevityE2ETests` against that API,
#   5. the packaged app run with `--smoke` against the same API.
# Cleanup (trap on EXIT/INT/TERM) stops the API process started here and `docker stop`s only the
# container created here. No other database, container or .env file is ever touched.
#
# Exit code 0 only when every phase passed.
set -uo pipefail

PACKAGE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE/../.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
SCRATCH="$PACKAGE/.build-e2e"

TMP="$(mktemp -d)"
CID=""
API_PID=""
SWIFT_STATUS="not run"
SMOKE_STATUS="not run"
SWIFT_SUMMARY=""
SMOKE_LINE=""
OVERALL=1

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null
    for _ in $(seq 1 40); do kill -0 "$API_PID" 2>/dev/null || break; sleep 0.25; done
    kill -9 "$API_PID" 2>/dev/null
  fi
  if [[ -n "$CID" ]]; then
    docker stop -t 3 "$CID" >/dev/null 2>&1   # started with --rm: stopping removes it
  fi
  # Only files this script created; no recursive delete.
  rm -f "$TMP"/*.log "$TMP"/*.json "$TMP"/smoke.* 2>/dev/null
  rmdir "$TMP" 2>/dev/null
  echo
  echo "================ E2E SUMMARY ================"
  echo "swift tests : $SWIFT_STATUS${SWIFT_SUMMARY:+  ($SWIFT_SUMMARY)}"
  echo "app smoke   : $SMOKE_STATUS${SMOKE_LINE:+  $SMOKE_LINE}"
  if [[ $OVERALL -eq 0 ]]; then
    echo "RESULT      : PASS"
    exit 0
  fi
  echo "RESULT      : FAIL"
  [[ $status -ne 0 ]] && exit "$status"
  exit 1
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for tool in docker bun node curl python3 openssl swift; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required"
done

free_port() {
  python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

json_field() { # json-file python-expression-over-d
  python3 -c 'import json, sys; d = json.load(open(sys.argv[1])); print(eval(sys.argv[2]))' "$1" "$2"
}

# ---------------------------------------------------------------------------------------------
# 1. Throw-away Postgres
# ---------------------------------------------------------------------------------------------
DB_PASSWORD="$(openssl rand -hex 16)"
DB_NAME="husrevity_e2e"
log "starting a disposable postgres container"
CID="$(docker run -d --rm -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
  postgres:16-alpine)" || die "could not start the postgres container"
DB_PORT="$(docker port "$CID" 5432/tcp | head -1 | sed 's/.*://')"
[[ -n "$DB_PORT" ]] || die "could not determine the container's host port"
echo "    container ${CID:0:12} on 127.0.0.1:$DB_PORT"

ready=0
for _ in $(seq 1 120); do
  # TCP on the container's own loopback only answers after the init phase has finished.
  if docker exec "$CID" psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -tAc 'select 1' >/dev/null 2>&1 \
    && python3 -c 'import socket,sys; socket.create_connection(("127.0.0.1", int(sys.argv[1])), 2).close()' "$DB_PORT" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.5
done
[[ $ready -eq 1 ]] || die "postgres did not become ready"

# ---------------------------------------------------------------------------------------------
# 2. Migrations + API
# ---------------------------------------------------------------------------------------------
API_PORT="$(free_port)"
JWT_SECRET="$(openssl rand -base64 48)"
CRYPTO_KEY="$(openssl rand -base64 32)"
BASE_URL="http://127.0.0.1:$API_PORT/api"

# `env -i` keeps the developer's shell (any HUSREVITY_*/MAIL_*/SLACK_* variable in it) out of the
# process. Bun has to run from apps/api to apply the decorator settings of its tsconfig, so a
# .env file there could still feed dotenv. No .env is ever created or modified; every setting
# that matters is passed explicitly and the optional integrations are blanked, because dotenv
# never overrides a variable that is already set (an empty one counts as set).
# Always call this inside a subshell: it `exec`s, so the subshell's PID becomes the process's PID.
if [[ -f "$API_DIR/.env" ]]; then
  echo "    note: $API_DIR/.env exists; it cannot override anything this script sets"
fi
api_env() {
  exec env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
    NODE_ENV=e2e \
    HUSREVITY_DB_HOST=127.0.0.1 HUSREVITY_DB_PORT="$DB_PORT" HUSREVITY_DB_USER=postgres \
    HUSREVITY_DB_PASSWORD="$DB_PASSWORD" HUSREVITY_DB_NAME="$DB_NAME" \
    HUSREVITY_JWT_SECRET="$JWT_SECRET" HUSREVITY_CRYPTO_KEY="$CRYPTO_KEY" \
    HUSREVITY_PORT="$API_PORT" HUSREVITY_CORS_ORIGINS="http://localhost:3090" \
    HUSREVITY_WEB_URL="http://localhost:3090" \
    GOOGLE_GEMINI_API_KEY= VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= MAIL_USER= MAIL_PASS= \
    SLACK_BOT_TOKEN= SLACK_APP_TOKEN= TELEGRAM_BOT_TOKEN= GOOGLE_CALENDAR_CLIENT_ID= \
    GOOGLE_CALENDAR_CLIENT_SECRET= GOOGLE_CALENDAR_REDIRECT_URI= GOOGLE_CALENDAR_WEBHOOK_URL= \
    "$@"
}

# Bun cannot load the API sources directly (type-only imports break its CommonJS loader), so the
# API is compiled with its own build script and run with node, exactly like `start:prod`. The only
# things written are the git-ignored apps/api/dist and packages/parser/dist build outputs.
log "building the API"
(cd "$API_DIR" && bun run build) >"$TMP/build.log" 2>&1 \
  || { tail -30 "$TMP/build.log"; die "API build failed"; }

log "applying API migrations"
(cd "$API_DIR" && api_env node dist/db/migrate.js run) >"$TMP/migrate.log" 2>&1 \
  || { tail -30 "$TMP/migrate.log"; die "migrations failed"; }
tail -2 "$TMP/migrate.log"

log "starting the API on $BASE_URL"
(cd "$API_DIR" && api_env node dist/main.js) >"$TMP/api.log" 2>&1 &
API_PID=$!
disown "$API_PID" 2>/dev/null  # no "Terminated" job notice at cleanup; liveness is polled with kill -0

healthy=0
for _ in $(seq 1 240); do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    tail -40 "$TMP/api.log"
    die "the API process exited during startup"
  fi
  if curl -fsS -o /dev/null "$BASE_URL/health" 2>/dev/null; then healthy=1; break; fi
  sleep 0.5
done
[[ $healthy -eq 1 ]] || { tail -40 "$TMP/api.log"; die "the API did not become healthy"; }
echo "    healthy (pid $API_PID)"

# ---------------------------------------------------------------------------------------------
# 3. Throw-away user + seed data for the smoke
# ---------------------------------------------------------------------------------------------
# The API throttles per client IP and trusts X-Forwarded-For (one proxy hop), so every
# requester here announces its own address; that keeps the 100 req/min and 20 auth/min limits
# from coupling unrelated tests together.
RUN_ID="$(openssl rand -hex 4)"
E2E_EMAIL="e2e-$RUN_ID@example.test"
E2E_PASSWORD="$(openssl rand -hex 12)Aa1"
XFF="10.250.0.1"

api_post() { # path token json-body -> writes $TMP/resp.json, echoes HTTP status
  local path="$1" token="$2" body="$3"
  local auth=()
  [[ -n "$token" ]] && auth=(-H "Authorization: Bearer $token")
  curl -sS -o "$TMP/resp.json" -w '%{http_code}' -X POST "$BASE_URL$path" \
    -H 'Content-Type: application/json' -H "X-Forwarded-For: $XFF" ${auth[@]+"${auth[@]}"} -d "$body"
}

log "registering the throw-away user"
status="$(api_post /auth/register "" "{\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\",\"firstName\":\"E2E\"}")"
[[ "$status" == "201" ]] || { cat "$TMP/resp.json"; die "register answered HTTP $status"; }
ACCESS_TOKEN="$(json_field "$TMP/resp.json" 'd["data"]["accessToken"]')"
[[ -n "$ACCESS_TOKEN" ]] || die "register returned no access token"

log "seeding data for the smoke run"
SEED_TAG="smoke-$RUN_ID"
for spec in \
  "/projects|{\"code\":\"SM$RUN_ID\",\"name\":\"Smoke project $SEED_TAG\"}" \
  "/notes|{\"title\":\"Smoke note $SEED_TAG\",\"bodyMarkdown\":\"seeded by e2e.sh\"}" \
  "/items|{\"kind\":\"task\",\"title\":\"Smoke item $SEED_TAG\",\"source\":\"web\"}"; do
  status="$(api_post "${spec%%|*}" "$ACCESS_TOKEN" "${spec#*|}")"
  [[ "$status" == "201" ]] || { cat "$TMP/resp.json"; die "seeding ${spec%%|*} answered HTTP $status"; }
done

# ---------------------------------------------------------------------------------------------
# 4. Swift E2E tests
# ---------------------------------------------------------------------------------------------
log "swift test --filter HusrevityE2ETests"
export HUSREVITY_E2E_URL="$BASE_URL"
export HUSREVITY_E2E_EMAIL="$E2E_EMAIL"
export HUSREVITY_E2E_PASSWORD="$E2E_PASSWORD"
swift test --package-path "$PACKAGE" --scratch-path "$SCRATCH" --filter HusrevityE2ETests 2>&1 | tee "$TMP/swift.log"
swift_code=${PIPESTATUS[0]}
if grep -q "Failed to persist idempotency key" "$TMP/api.log"; then
  echo "    API warnings during the run:"
  grep "Failed to persist idempotency key" "$TMP/api.log" | sort | uniq -c | sed 's/^/      /'
fi
SWIFT_SUMMARY="$(grep -E 'Executed [0-9]+ tests?, with' "$TMP/swift.log" | tail -1 | sed 's/^[[:space:]]*//')"
executed="$(echo "$SWIFT_SUMMARY" | sed -n 's/.*Executed \([0-9]*\) test.*/\1/p')"
skipped="$(echo "$SWIFT_SUMMARY" | sed -n 's/.*with \([0-9]*\) test.* skipped.*/\1/p')"
if [[ $swift_code -eq 0 && -n "$executed" && "${executed:-0}" -gt 0 && "${skipped:-0}" -eq 0 ]]; then
  SWIFT_STATUS="PASS"
else
  SWIFT_STATUS="FAIL (exit $swift_code${skipped:+, $skipped skipped})"
fi

# ---------------------------------------------------------------------------------------------
# 5. Packaged app, --smoke
# ---------------------------------------------------------------------------------------------
log "building Husrevity.app"
if SCRATCH_PATH="$SCRATCH" "$PACKAGE/scripts/make-app.sh" >"$TMP/make-app.log" 2>&1; then
  tail -1 "$TMP/make-app.log"
  APP_BIN="$PACKAGE/build/Husrevity.app/Contents/MacOS/HusrevityApp"
  log "running the app with --smoke"
  (
    export HUSREVITY_API_URL="$BASE_URL" HUSREVITY_EMAIL="$E2E_EMAIL" HUSREVITY_PASSWORD="$E2E_PASSWORD"
    export HUSREVITY_DB_PATH="$TMP/smoke.sqlite"
    "$APP_BIN" --smoke >"$TMP/smoke.out" 2>"$TMP/smoke.err" &
    pid=$!
    ( sleep 120; kill "$pid" 2>/dev/null ) &
    watchdog=$!
    wait "$pid"
    code=$?
    kill "$watchdog" 2>/dev/null
    echo "$code" >"$TMP/smoke.code"
  )
  smoke_code="$(cat "$TMP/smoke.code" 2>/dev/null || echo 99)"
  SMOKE_LINE="$(grep -E '^\{' "$TMP/smoke.out" | tail -1)"
  echo "    exit code $smoke_code"
  echo "    $SMOKE_LINE"
  if [[ "$smoke_code" == "0" ]] && echo "$SMOKE_LINE" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
assert d["ok"] is True, "ok is not true"
for key in ("items", "notes", "projects"):
    assert d[key] > 0, key + " is zero"
assert d["pending"] == 0, "outbox not empty"
'; then
    SMOKE_STATUS="PASS"
  else
    SMOKE_STATUS="FAIL (exit $smoke_code)"
    cat "$TMP/smoke.err" 2>/dev/null | tail -20
  fi
else
  tail -30 "$TMP/make-app.log"
  SMOKE_STATUS="FAIL (make-app.sh)"
fi

if [[ "$SWIFT_STATUS" == "PASS" && "$SMOKE_STATUS" == "PASS" ]]; then OVERALL=0; fi
exit $OVERALL
