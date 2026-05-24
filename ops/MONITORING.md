# Monitoring & backup verification (first-week checklist)

Backups are wired up via the infra repo's per-app LaunchAgent (`~/iamhusrev-prod/launchagents/com.iamhusrev.backup.husrevity.plist`); this doc covers what to verify and what to add on top.

## Uptime monitoring (free tier)

Pick one — both work, BetterStack has a slightly nicer UI:

- **UptimeRobot** (free, 50 monitors, 5-min checks): https://uptimerobot.com/
- **BetterStack Uptime** (free tier, 10 monitors, 3-min checks): https://betterstack.com/uptime

Set up two HTTP(S) keyword monitors:

| Name          | URL                                    | Expected    | Frequency |
| ------------- | -------------------------------------- | ----------- | --------- |
| husrevity api | `https://api.iamhusrev.com/api/health` | `"db":"UP"` | 3–5 min   |
| husrevity web | `https://app.iamhusrev.com/`           | HTTP 200    | 3–5 min   |

Alert on: 2 consecutive failures, email to iamhusrev@gmail.com.

## Backup verification (do this in week 1, then monthly)

The daily LaunchAgent dumps to `~/Backup/husrevity-db-dumps/` and Drive syncs it. Verify the backup actually works by restoring it into a throwaway DB:

```bash
# 1. List recent dumps
ls -lh ~/Backup/husrevity-db-dumps/husrevity_prod-*.dump | tail -3

# 2. Create scratch DB inside the prod postgres container
docker exec -it husrevity-prod-postgres \
  psql -U postgres -c "CREATE DATABASE husrevity_restore_test;"

# 3. Restore the most recent dump into it
LATEST=$(ls -t ~/Backup/husrevity-db-dumps/husrevity_prod-*.dump | head -1)
docker exec -i husrevity-prod-postgres \
  pg_restore -U postgres -d husrevity_restore_test < "$LATEST"

# 4. Sanity-check row counts
docker exec -it husrevity-prod-postgres \
  psql -U postgres -d husrevity_restore_test -c \
  "SELECT 'app_user' AS t, count(*) FROM app_user UNION ALL
   SELECT 'note', count(*) FROM note UNION ALL
   SELECT 'task', count(*) FROM task;"

# 5. Drop the scratch DB
docker exec -it husrevity-prod-postgres \
  psql -U postgres -c "DROP DATABASE husrevity_restore_test;"
```

If row counts look right, the backup chain works. If `pg_restore` errors, the dump is corrupt — investigate before you trust the backup chain.

## Log review (manual, weekly)

```bash
# api logs (last 200 lines)
docker compose -f docker-compose.prod.yml logs api --tail=200

# auth-related events (login failures, token cleanup)
docker compose -f docker-compose.prod.yml logs api | grep -E "AuthService|JwtAuthGuard|Unauthorized"

# cloudflared tunnel log (LaunchAgent stderr → ~/Library/Logs/iamhusrev/)
tail -100 ~/Library/Logs/iamhusrev/cloudflared.err.log
```

Things to look for:

- Sustained `Unauthorized` from a single IP → potential brute force, consider tightening throttler.
- `Cleaned up N expired/revoked refresh token(s)` → daily 03:00 cron is alive.
- `db ping timeout` in health endpoint → postgres pressure or networking issue.

## Out of scope for now

- Sentry / error tracking — add when you start seeing real bugs in prod logs.
- Log aggregation (Loki / Vector) — overkill for one Mac; `docker logs` is enough.
- Resource alerts (CPU/RAM) — single-user app on a Mac, eyeball Activity Monitor occasionally.
