# GitHub Actions self-hosted runner setup

Runs on the prod Mac. After this is set up, every push to `main` rebuilds and
restarts the docker-compose stack (`.github/workflows/deploy.yml`).

## 1. Register a new runner with GitHub

1. Go to `https://github.com/<your-user>/<husrevity-repo>/settings/actions/runners` → **New self-hosted runner** → **macOS** → **arm64**.
2. GitHub gives you a paste-block of three commands. Run them in a terminal **on the prod Mac**, in `~/actions-runner/` (the script creates this dir):
   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   # paste the download + extract + ./config.sh from GitHub
   ```
3. When `./config.sh` prompts for labels, accept the defaults plus add **`macOS`** and **`iamhusrev-prod`** explicitly so it matches the workflow's `runs-on: [self-hosted, macOS, iamhusrev-prod]`. The `iamhusrev-prod` label is the host-identifier — every personal project that deploys to the same Mac uses it, so projects can share one runner.
4. Set the work directory to the default (`_work`).

## 2. Install the runner as a launchd service

So it auto-starts on login (and survives reboots / sleeps the same way Docker does):

```bash
cd ~/actions-runner
./svc.sh install
./svc.sh start

# verify it's running:
./svc.sh status
```

The runner now appears as **Idle** in the GitHub Actions panel.

## 3. Make sure the runner can find docker

The runner's PATH at service-start time is minimal and doesn't include `/usr/local/bin` or `/opt/homebrew/bin` by default. If `docker compose` errors with "command not found" in the workflow logs:

```bash
# Stop, edit the launchd plist to inject PATH, restart
./svc.sh stop
plutil -p ~/Library/LaunchAgents/actions.runner.<owner>-<repo>.<runner-name>.plist
# Add EnvironmentVariables → PATH that includes /usr/local/bin:/opt/homebrew/bin
./svc.sh start
```

Or simpler: symlink docker into a default-PATH dir:

```bash
sudo ln -s "$(which docker)" /usr/local/bin/docker
sudo ln -s "$(which docker-compose)" /usr/local/bin/docker-compose 2>/dev/null || true
```

## 4. Pre-flight (do this once, then test the workflow)

The workflow expects two symlinks to exist in the repo working tree the runner checks out:

```bash
cd /Users/husrev/actions-runner/_work/<repo>/<repo>
ln -s ~/.husrevity/api.env apps/api/.env.prod
ln -s ~/.husrevity/api.env .env
```

> Note: `actions/checkout@v4` doesn't delete the `.env` symlink between runs (it's gitignored), so this is one-time. If you ever clean `_work/`, redo the symlinks.

## 5. Trigger the first deploy

```bash
git commit --allow-empty -m "ci: trigger first deploy"
git push origin main
```

Watch in GitHub Actions tab. First run includes image builds (~3–5 min); subsequent runs are faster thanks to docker layer cache.

## 6. Rollback

GitHub UI → revert the offending PR → push the revert → workflow auto-redeploys the previous code. The `concurrency: prod-deploy` group means the revert won't race the original deploy.

If a deploy is wedged on the runner, ssh into the Mac and:

```bash
cd /Users/husrev/actions-runner/_work/<repo>/<repo>
docker compose -f docker-compose.prod.yml logs --tail=200
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```
