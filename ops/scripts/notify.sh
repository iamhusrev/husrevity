#!/usr/bin/env bash
#
# Tiny notifier — Discord webhook + macOS `mail`. Used by deploy and backup
# scripts. Silently no-ops if neither WEBHOOK_URL nor ALERT_EMAIL is set.
#
# Usage:
#   ops/scripts/notify.sh OK   "deploy" "main@<sha> healthy in 47s"
#   ops/scripts/notify.sh FAIL "backup" "pg_dump exited 1 — see /Users/.../backup.err.log"
#
# Env:
#   WEBHOOK_URL          Discord/Slack-compatible webhook (Discord JSON format)
#   ALERT_EMAIL          recipient for `mail` (defaults to iamhusrev@gmail.com)
#   NOTIFY_EMAIL_ON_OK   set to 1 to email on OK too (default: only FAIL)

set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <OK|FAIL> <subject> <message>" >&2
  exit 2
fi

status="$1"
subject="$2"
message="$3"
host="$(hostname -s)"
when="$(date '+%Y-%m-%d %H:%M:%S %Z')"

# Discord
if [[ -n "${WEBHOOK_URL:-}" ]]; then
  emoji=":white_check_mark:"; [[ "$status" == "FAIL" ]] && emoji=":x:"
  if command -v jq >/dev/null 2>&1; then
    payload="$(jq -nc \
      --arg c "$emoji **[$status] $subject** — $host @ $when"$'\n'"$message" \
      '{content: $c}')"
  else
    # crude fallback (no jq) — assumes no double-quotes in inputs
    payload="{\"content\":\"$emoji **[$status] $subject** — $host @ $when\n$message\"}"
  fi
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "$payload" "$WEBHOOK_URL" >/dev/null 2>&1 || true
fi

# Email (FAIL by default; OK only if NOTIFY_EMAIL_ON_OK=1)
if [[ "$status" == "FAIL" || "${NOTIFY_EMAIL_ON_OK:-0}" == "1" ]]; then
  to="${ALERT_EMAIL:-iamhusrev@gmail.com}"
  if command -v mail >/dev/null 2>&1; then
    printf '%s\n\nHost: %s\nWhen: %s\n' "$message" "$host" "$when" \
      | mail -s "[$status] husrevity: $subject" "$to" 2>/dev/null || true
  fi
fi

# Always echo to stdout so the calling script's log captures the event.
echo "[notify] $status $subject — $message"
