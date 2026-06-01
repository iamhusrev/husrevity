#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
bun dist/db/migrate.js run

echo "[entrypoint] starting api..."
exec "$@"
