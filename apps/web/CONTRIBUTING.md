# Contributing to husrevity

## Commit format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `style`, `perf`, `build`, `ci`.

Examples:

- `feat(notes): add markdown preview pane`
- `fix(auth): preserve target URL across login redirect`
- `chore(deps): bump next to 15.5.0`

## Local checks before pushing

```bash
npm run lint
npm run build      # catches type errors and build-time issues
```

(No test runner is configured yet. When one is added, document its command here.)

## next.config.ts — `output: 'standalone'`

This project ships with `output: 'standalone'` set. The production deploy
unpacks `.next/standalone/` and runs `node server.js` directly under PM2 —
no `npm install` on the target host. **Do not remove this setting** without
also updating `iamhusrev-deploy/scripts/deploy-frontend.sh` and the release
workflow's tarball assembly step.

## Releasing

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers:

1. **`release.yml`** — builds the production bundle and packages
   `husrevity-v0.1.0.tgz` (standalone server + `.next/static` + `public/`).
2. **`deploy.yml`** — `release: published` fires on the self-hosted MacBook
   runner; executes `/Users/husrev/deploy/scripts/deploy-frontend.sh v0.1.0`,
   which pulls, `npm ci`, builds, `pm2 reload`, and smoke-tests
   `https://iamhusrev.com/`.

Tag format: **`vMAJOR.MINOR.PATCH`**.

To deploy without cutting a release, use the **Run workflow** button on the
`Deploy` workflow in GitHub Actions.

## CI

Every push and PR to `main` runs `ci.yml`: lint + production build. No tests yet.
