#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
node dist/db/migrate.js run

echo "[entrypoint] starting api..."
exec "$@"
